// server/tipe-session.d.ts
// Augmentasi tipe untuk express-session biar TypeScript ngerti field custom kita.

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    sudahLogin?: boolean;
    userId?: string;
    username?: string;
  }
}
