import { Hono } from "hono";
import { getUserContributions } from "./usercontrib.js";
import { generateSVG } from "./svg.js";
import { getSiteConfig, getAllSites, getAllColorSets } from "./sites.js";
import type { KVNamespace } from "@cloudflare/workers-types";

type Env = {
    mediawiki_usercontrib_heatmap: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
    const sites = getAllSites().join(", ");
    const colors = getAllColorSets().join(", ");
    const host = c.req.header("host") || "localhost";
    const protocol = c.req.header("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;
    return c.text(
        `MediaWiki User Contribution Heatmap Generator\n\n` +
        `API Base URL: ${baseUrl}\n` +
        `Usage: ${baseUrl}/generate?site=<site>&username=<username>&color=<colortype>&round=<num>&vertical=<bool>\n\n` +
        `Available sites: ${sites}\n` +
        `Available color sets: ${colors}`,
    );
});

app.get("/generate", async (c) => {
    try {
        const site = c.req.query("site");
        const username = c.req.query("username");

        if (!site || !username) {
            return c.json({ error: "Missing required parameters: site and username" }, 400);
        }

        const siteConfig = getSiteConfig(site);
        if (!siteConfig) {
            return c.json({ error: `Unknown site: ${site}` }, 400);
        }

        const color = c.req.query("color") ?? siteConfig.color ?? "default";
        const round = parseInt(c.req.query("round") ?? String(siteConfig.round ?? 0), 10);
        const vertical = c.req.query("vertical")?.toLowerCase() === "true";

        if (round < 0 || round > 14) {
            return c.json({ error: "Invalid round value. Must be between 0 and 14." }, 400);
        }

        const contributions = await getUserContributions(c, site, username, c.env.mediawiki_usercontrib_heatmap);

        const svg = generateSVG(contributions, {
            colorScheme: color,
            round,
            vertical,
        });

        return c.html(svg);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return c.json({ error: message }, 500);
    }
});

export default app;
