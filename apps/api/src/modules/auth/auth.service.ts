import crypto from 'crypto'

import { eq, and } from 'drizzle-orm'

import { db } from '../../db/client'
import { users, refreshTokens as refreshTokensTable } from '../../db/schema'
import { AppError } from '../../lib/AppError'
import { hashPassword, verifyPassword } from '../../lib/bcrypt'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt'

import type { AuthTokenPair, LoginInput, RegisterInput, SafeUser } from './auth.types'

type DemoUser = {
  id: string
  email: string
  username: string
  xp: number
  level: number
  streak: number
  passwordHash: string
}

const fallbackUsers = new Map<string, DemoUser>()
const fallbackRefreshTokens = new Map<string, string>()

async function ensureDemoUser(): Promise<DemoUser> {
  const demoEmail = 'demo@mathviz.com'
  const existing = [...fallbackUsers.values()].find((user) => user.email === demoEmail)
  if (existing) return existing

  const user: DemoUser = {
    id: 'demo-user-id',
    email: demoEmail,
    username: 'demo',
    xp: 1250,
    level: 5,
    streak: 7,
    passwordHash: await hashPassword('demo123'),
  }

  fallbackUsers.set(user.id, user)
  fallbackUsers.set(user.email, user)
  return user
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function toSafeUser(
  row: Pick<DemoUser, 'id' | 'email' | 'username' | 'xp' | 'level' | 'streak'>,
): SafeUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    xp: row.xp,
    level: row.level,
    streak: row.streak,
  }
}

function issueTokenPair(user: SafeUser): AuthTokenPair {
  const payload = { sub: user.id, email: user.email, username: user.username }
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  }
}

export async function registerUser(input: RegisterInput): Promise<SafeUser> {
  try {
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1)

    if (existingEmail) throw new AppError('AUTH_EMAIL_TAKEN', 'Email is already registered')

    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1)

    if (existingUsername) throw new AppError('AUTH_USERNAME_TAKEN', 'Username is already taken')

    const passwordHash = await hashPassword(input.password)

    const [inserted] = await db
      .insert(users)
      .values({ email: input.email, username: input.username, passwordHash })
      .returning()

    if (!inserted) throw new AppError('INTERNAL_ERROR', 'Failed to create user')

    return toSafeUser(inserted)
  } catch (error) {
    if (error instanceof AppError) throw error

    const duplicateEmail = [...fallbackUsers.values()].find((user) => user.email === input.email)
    if (duplicateEmail) throw new AppError('AUTH_EMAIL_TAKEN', 'Email is already registered')

    const duplicateUsername = [...fallbackUsers.values()].find(
      (user) => user.username === input.username,
    )
    if (duplicateUsername) throw new AppError('AUTH_USERNAME_TAKEN', 'Username is already taken')

    const passwordHash = await hashPassword(input.password)
    const user: DemoUser = {
      id: `demo-user-${Date.now()}`,
      email: input.email,
      username: input.username,
      xp: 0,
      level: 1,
      streak: 0,
      passwordHash,
    }
    fallbackUsers.set(user.id, user)
    fallbackUsers.set(user.email, user)
    return toSafeUser(user)
  }
}

export async function loginUser(
  input: LoginInput,
): Promise<{ user: SafeUser; tokens: AuthTokenPair }> {
  try {
    const [row] = await db.select().from(users).where(eq(users.email, input.email)).limit(1)

    const valid = row ? await verifyPassword(input.password, row.passwordHash) : false
    if (!row || !valid) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect email or password')
    }

    const user = toSafeUser(row)
    const tokens = issueTokenPair(user)

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(refreshTokensTable).values({
      userId: user.id,
      tokenHash: hashToken(tokens.refreshToken),
      expiresAt,
    })

    return { user, tokens }
  } catch (error) {
    if (error instanceof AppError) throw error

    const demoUser = await ensureDemoUser()
    const valid = await verifyPassword(input.password, demoUser.passwordHash)

    if (input.email !== demoUser.email || !valid) {
      const user = [...fallbackUsers.values()].find((candidate) => candidate.email === input.email)
      if (!user) {
        throw new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect email or password')
      }
      const userValid = await verifyPassword(input.password, user.passwordHash)
      if (!userValid) throw new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect email or password')
      const safeUser = toSafeUser(user)
      const tokens = issueTokenPair(safeUser)
      fallbackRefreshTokens.set(hashToken(tokens.refreshToken), user.id)
      return { user: safeUser, tokens }
    }

    const user = toSafeUser(demoUser)
    const tokens = issueTokenPair(user)
    fallbackRefreshTokens.set(hashToken(tokens.refreshToken), user.id)
    return { user, tokens }
  }
}

export async function refreshTokens(token: string): Promise<AuthTokenPair> {
  try {
    const payload = verifyRefreshToken(token)

    const tokenHash = hashToken(token)
    const [stored] = await db
      .select()
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.userId, payload.sub),
          eq(refreshTokensTable.tokenHash, tokenHash),
        ),
      )
      .limit(1)

    if (!stored) throw new AppError('AUTH_TOKEN_INVALID', 'Refresh token not recognised')

    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, stored.id))

    const newTokens = issueTokenPair({
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      xp: 0,
      level: 1,
      streak: 0,
    })

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(refreshTokensTable).values({
      userId: payload.sub,
      tokenHash: hashToken(newTokens.refreshToken),
      expiresAt,
    })

    return newTokens
  } catch (error) {
    if (error instanceof AppError) throw error

    const user = await ensureDemoUser()
    const tokenHash = hashToken(token)
    const storedUserId = fallbackRefreshTokens.get(tokenHash)

    if (!storedUserId || storedUserId !== user.id) {
      throw new AppError('AUTH_TOKEN_INVALID', 'Refresh token not recognised')
    }

    const tokens = issueTokenPair(toSafeUser(user))
    fallbackRefreshTokens.delete(tokenHash)
    fallbackRefreshTokens.set(hashToken(tokens.refreshToken), user.id)
    return tokens
  }
}

export async function logoutUser(token: string): Promise<void> {
  const tokenHash = hashToken(token)
  fallbackRefreshTokens.delete(tokenHash)

  try {
    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.tokenHash, tokenHash))
  } catch {
    // Demo mode fallback just ignores the DB delete.
  }
}
