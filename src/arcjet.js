import arcjet, {detectBot, shield, slidingWindow} from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_MODE === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';
const isDev = process.env.NODE_ENV !== "production";

if(!arcjetKey) {
    console.warn('ARCJET_KEY is not set — ArcJet security is disabled.');
}
export const httpArcjet = arcjetKey ?
    arcjet({
        key: arcjetKey,
        rules: [
            shield({ mode: arcjetMode }),
            detectBot({ mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', "CATEGORY:PREVIEW", ...(isDev ? ["POSTMAN"] : []) ]}),
            slidingWindow({ mode: arcjetMode, interval: '10s', max: 50 })
        ],
    }) : null;

export const wsArcjet = arcjetKey ?
    arcjet({
        key: arcjetKey,
        rules: [
            shield({ mode: arcjetMode }),
            detectBot({ mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', "CATEGORY:PREVIEW", ...(isDev ? ["POSTMAN"] : []) ]}),
            slidingWindow({ mode: arcjetMode, interval: '2s', max: 5 })
        ],
    }) : null;

export function securityMiddleware() {
    return async (req, res, next) => {
        if(!httpArcjet) return next();

        try {
            const decision = await httpArcjet.protect(req);

            if(decision.isDenied()) {
                if(decision.reason.isRateLimit()) {
                    return res.status(429).json({ error: 'Too many requests.' });
                }

                if (isDev) {
                    let reason;
                    try {
                        reason = JSON.parse(
                            JSON.stringify(decision.reason, (key, value) => {
                                if (typeof value === "bigint") return value.toString();
                                return value;
                            })
                        );
                    } catch {
                        reason = {
                            name: decision.reason?.constructor?.name,
                            value: Object.prototype.toString.call(decision.reason),
                        };
                    }

                    return res.status(403).json({
                        error: "Forbidden.",
                        arcjet: {
                            denied: true,
                            reason,
                        },
                    });
                }

                return res.status(403).json({ error: 'Forbidden.' });
            }
        } catch (e) {
            console.error('Arcjet middleware error', e);
            return res.status(503).json({ error: 'Service Unavailable' });
        }

        next();
    }
}