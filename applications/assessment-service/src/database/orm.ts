import { MikroORM } from "@mikro-orm/postgresql";
import config from "./mikro-orm.config";

export let orm: MikroORM;

export async function connectDB() {
  orm = await MikroORM.init(config);
}
