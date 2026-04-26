"use strict";

/**
 * Client-bundle stub: Prisma must only run on the server. Prevents webpack from resolving
 * `.prisma/client/index-browser.js` (missing if generate/copy was incomplete).
 */
function deny() {
  throw new Error("@prisma/client cannot be used in the browser");
}

module.exports = {
  Prisma: new Proxy(
    {},
    {
      get() {
        return deny;
      },
    },
  ),
  PrismaClient: class PrismaClient {
    constructor() {
      deny();
    }
  },
};
