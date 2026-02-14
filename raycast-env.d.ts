/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `ask` command */
  export type Ask = ExtensionPreferences & {
  /** TownSpot API Base URL - Base URL for the TownSpot API */
  "apiBaseUrl": string,
  /** Locale - API locale (en-GB, es-ES, ca-ES) */
  "locale": string
}
}

declare namespace Arguments {
  /** Arguments passed to the `ask` command */
  export type Ask = {}
}

