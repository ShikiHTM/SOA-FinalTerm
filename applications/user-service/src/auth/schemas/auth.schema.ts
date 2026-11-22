import { z } from "zod";
import { OAuthProvider } from "../../shared/types";

export const LoginRequestSchema = z.object({
    identifier: z.string().trim().min(1, "Email or username is required.").max(255),
    password: z.string().min(1, "Password is required.").max(128)
});

export const RegisterRequestSchema = z.object({
    email: z.string().trim().email("Valid email address is required.").max(255),
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters.")
        .max(64, "Username must not exceed 64 characters.")
        .regex(
            /^[a-zA-Z0-9_.-]+$/,
            "Username may only contain letters, numbers, dots, underscores, and hyphens."
        ),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters.")
        .max(128, "Password must not exceed 128 characters.")
        .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
        .regex(/[a-z]/, "Password must include at least one lowercase letter.")
        .regex(/[0-9]/, "Password must include at least one digit."),
    display_name: z
        .string()
        .trim()
        .min(1, "Display name is required.")
        .max(120, "Display name must not exceed 120 characters.")
});

export const OAuthLoginRequestSchema = z.object({
    provider: z.nativeEnum(OAuthProvider),
    code: z.string().trim().min(1, "Authorization code is required."),
    redirect_uri: z.string().url("Valid redirect URI is required.")
});

export const VerifyTokenRequestSchema = z.object({
    token: z.string().trim().min(1, "Token is required.")
});

export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;
export type RegisterRequestDto = z.infer<typeof RegisterRequestSchema>;
export type OAuthLoginRequestDto = z.infer<typeof OAuthLoginRequestSchema>;
