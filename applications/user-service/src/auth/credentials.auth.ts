import type { EntityManager } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { UserSchema, type UserEntity } from "../db/entities/user.entity";
import { AppError } from "../shared/errors";
import { UserStatus, UserSystemRole } from "../shared/types";
import { hashPassword, verifyPassword } from "./auth.token";
import type { LoginRequestDto, RegisterRequestDto } from "./schemas/auth.schema";

export async function loginWithCredentials(
    payload: LoginRequestDto,
    em: EntityManager
): Promise<UserEntity> {
    const trimmedIdentifier: string = payload.identifier.trim();
    const normalizedEmail: string = trimmedIdentifier.toLowerCase();
    const user: UserEntity | null = await em.findOne(UserSchema, {
        deletedAt: null,
        $or: [{ email: normalizedEmail }, { username: trimmedIdentifier }]
    });
    if (user === null || user.passwordHash === null) {
        throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email/username or password.");
    }
    const passwordMatches: boolean = await verifyPassword(payload.password, user.passwordHash);
    if (!passwordMatches) {
        throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email/username or password.");
    }
    if (user.status !== UserStatus.ACTIVE) {
        throw AppError.forbidden("ACCOUNT_LOCKED", "Account is suspended or banned.");
    }
    return user;
}

export async function registerWithCredentials(
    payload: RegisterRequestDto,
    em: EntityManager
): Promise<UserEntity> {
    const normalizedEmail: string = payload.email.trim().toLowerCase();
    const trimmedUsername: string = payload.username.trim();
    const existingUser: UserEntity | null = await em.findOne(UserSchema, {
        $or: [{ email: normalizedEmail }, { username: trimmedUsername }]
    });
    if (existingUser !== null) {
        throw AppError.conflict("ACCOUNT_CONFLICT", "Email or username already exists.");
    }
    const passwordHash: string = await hashPassword(payload.password);
    const createdUser: UserEntity = em.create(UserSchema, {
        id: v4(),
        email: normalizedEmail,
        username: trimmedUsername,
        passwordHash,
        displayName: payload.display_name.trim(),
        privacySettings: {},
        systemRole: UserSystemRole.USER,
        status: UserStatus.ACTIVE
    });
    em.persist(createdUser);
    await em.flush();
    return createdUser;
}
