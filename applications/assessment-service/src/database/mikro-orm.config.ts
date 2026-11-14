import { defineConfig, type Options } from "@mikro-orm/postgresql";

const config: Options = defineConfig({
  debug: true
})

export default config;
