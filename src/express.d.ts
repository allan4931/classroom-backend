import { JWTPayload } from "./lib/jwt.js";

declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}

export {};
