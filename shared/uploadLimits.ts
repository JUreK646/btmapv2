/** Largest photo a user may attach to a station comment. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * Photos travel as base64 inside a JSON body, which inflates them by 4/3.
 * The extra megabyte covers the data-URL prefix and the comment text.
 * nginx `client_max_body_size` must not be lower than this (see nginx.conf).
 */
export const MAX_PHOTO_BODY_BYTES = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 1024 * 1024;

/** Body limit for every other JSON endpoint. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;
