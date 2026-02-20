
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    sdhlgn?: boolean;
    userId?: string;
    username?: string;
  }
}
