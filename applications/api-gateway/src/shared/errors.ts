import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ErrorResponseBody {
    error_code: string;
    message: string;
    details?: string[];
}

export class AppError extends Error {
    public readonly statusCode: ContentfulStatusCode;
    public readonly errorCode: string;
    public readonly details?: string[];

    public constructor(
        statusCode: ContentfulStatusCode,
        errorCode: string,
        message: string,
        details?: string[]
    ) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.details = details;
    }

    public toResponseBody(): ErrorResponseBody {
        const body: ErrorResponseBody = {
            error_code: this.errorCode,
            message: this.message
        };
        if (this.details && this.details.length > 0) {
            body.details = this.details;
        }
        return body;
    }

    public static badRequest(errorCode: string, message: string, details?: string[]): AppError {
        return new AppError(400, errorCode, message, details);
    }

    public static unauthorized(errorCode: string, message: string): AppError {
        return new AppError(401, errorCode, message);
    }

    public static forbidden(errorCode: string, message: string): AppError {
        return new AppError(403, errorCode, message);
    }

    public static notFound(errorCode: string, message: string): AppError {
        return new AppError(404, errorCode, message);
    }

    public static conflict(errorCode: string, message: string): AppError {
        return new AppError(409, errorCode, message);
    }

    public static badGateway(errorCode: string, message: string): AppError {
        return new AppError(502, errorCode, message);
    }
}

export function handleAppError(error: Error, c: Context): Response {
    if (error instanceof AppError) {
        return c.json(error.toResponseBody(), error.statusCode);
    }
    if (error instanceof HTTPException) {
        return c.json(
            {
                error_code: "HTTP_ERROR",
                message: error.message
            },
            error.status
        );
    }
    return c.json(
        {
            error_code: "INTERNAL_ERROR",
            message: "An unexpected internal error occurred."
        },
        500
    );
}
