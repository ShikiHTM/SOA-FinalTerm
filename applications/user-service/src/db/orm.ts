import { defineConfig, MikroORM, type EntityManager, type Options } from "@mikro-orm/postgresql";
import { loadEnvConfig, type EnvConfig } from "../shared/env";
import { TokenSchema } from "./entities/token.entity";
import { UserFollowSchema } from "./entities/user-follow.entity";
import { UserOAuthAccountSchema } from "./entities/user-oauth-account.entity";
import { UserSchema } from "./entities/user.entity";

let ormInstance: MikroORM | null = null;
let initPromise: Promise<MikroORM> | null = null;

export function createMikroOrmConfig(env: EnvConfig): Options {
    const config: Options = defineConfig({
        host: env.dbHost,
        port: env.dbPort,
        user: env.dbUser,
        password: env.dbPassword,
        dbName: env.dbName,
        entities: [
            UserSchema,
            UserOAuthAccountSchema,
            TokenSchema,
            UserFollowSchema
        ],
        debug: process.env.NODE_ENV === "development"
    });
    return config;
}

export async function connectDB(config?: Options): Promise<MikroORM> {
    if (ormInstance !== null) {
        return ormInstance;
    }
    if (initPromise !== null) {
        return initPromise;
    }
    const env: EnvConfig = loadEnvConfig();
    const ormConfig: Options = config ?? createMikroOrmConfig(env);
    initPromise = MikroORM.init(ormConfig)
        .then((initializedOrm: MikroORM): MikroORM => {
            ormInstance = initializedOrm;
            return initializedOrm;
        })
        .catch((error: unknown): never => {
            initPromise = null;
            throw error;
        });
    return initPromise;
}

export function getORM(): MikroORM {
    if (ormInstance === null) {
        throw new Error("MikroORM has not been initialized.");
    }
    return ormInstance;
}

export function forkEm(): EntityManager {
    return getORM().em.fork();
}

export async function closeDB(): Promise<void> {
    if (ormInstance !== null) {
        await ormInstance.close(true);
        ormInstance = null;
        initPromise = null;
    }
}

const DEFAULT_ENV: EnvConfig = loadEnvConfig();
const DEFAULT_CONFIG: Options = createMikroOrmConfig(DEFAULT_ENV);

export default DEFAULT_CONFIG;
