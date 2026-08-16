import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { api } from "./api.js";
import { shortId } from "./format.js";

// Visual approach borrowed from github.com/he-yufeng/IslandEscape's PixiJS
// renderer (crisp pixel-art look, no image assets, ground layer instead of
// empty space, multi-shape composed buildings/characters instead of flat
// boxes + emoji): antialias off + CSS pixelated scaling for crisp edges,
// and every entity is a small stack of Graphics primitives, not a single
// tinted rect. Positions are still deterministic client-side (hashed from
// ids) since no entity has real coordinates in the backend — that part is
// unchanged from the first pass, only the drawing is redone.
const WIDTH = 760;
const HEIGHT = 420;

const GROUND = 0x1e3a2b;
const GROUND_LINE = 0x25452f;

const ZONES: Record<string, { x: number; y: number; w: number; h: number; label: string; soil: number; roof: number; body: number }> = {
  FARM: { x: 24, y: 24, w: 320, h: 150, label: "FARMS", soil: 0x4a3524, roof: 0x8b3a2a, body: 0xa9744f },
  RESTAURANT: { x: 416, y: 24, w: 320, h: 150, label: "RESTAURANTS", soil: 0x3a2e1e, roof: 0xc9622f, body: 0xd9a066 },
  THEATRE: { x: 24, y: 246, w: 320, h: 150, label: "THEATRES", soil: 0x2a2438, roof: 0xb08a2e, body: 0x6b4f8a },
  HOME: { x: 416, y: 246, w: 320, h: 150, label: "AGENTS AT HOME", soil: 0x22331f, roof: 0x557a4a, body: 0x3d5a35 },
};

function hash01(id: string, salt: string): number {
  let h = 0;
  const s = id + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 10000) / 10000;
}

function zonePoint(zone: (typeof ZONES)[string], id: string): { x: number; y: number } {
  const pad = 30;
  return {
    x: zone.x + pad + hash01(id, "x") * (zone.w - pad * 2),
    y: zone.y + pad + 18 + hash01(id, "y") * (zone.h - pad * 2 - 18),
  };
}

/** A small building: roof + body + door, no two zone types share a silhouette. */
function drawBuilding(g: Graphics, roof: number, body: number, dim: boolean): void {
  const a = dim ? 0.35 : 1;
  g.roundRect(-14, -6, 28, 20, 2).fill({ color: body, alpha: a });
  g.poly([-17, -6, 0, -20, 17, -6]).fill({ color: roof, alpha: a });
  g.rect(-4, 4, 8, 10).fill({ color: 0x1a120c, alpha: a });
  g.rect(-11, -2, 5, 5).fill({ color: 0xf2d98a, alpha: dim ? 0.15 : 0.8 });
}

function drawTreasury(g: Graphics): void {
  g.roundRect(-24, -8, 48, 22, 2).fill(0x8a8a94);
  g.poly([-27, -8, 0, -24, 27, -8]).fill(0xd4af37).stroke({ width: 1, color: 0x8a6d1f });
  for (const dx of [-16, -6, 4, 14]) g.rect(dx, -3, 4, 15).fill(0x6f6f7a);
}

interface AgentSprite {
  container: Container;
  body: Graphics;
  head: Graphics;
  label: Text;
  bubble: Container | null;
  bubbleUntil: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  phase: number;
  shirt: number;
  lastDecisionId: string | null;
}

const bubbleStyle = new TextStyle({ fill: 0x0b0f14, fontSize: 11, fontFamily: "monospace", wordWrap: true, wordWrapWidth: 150 });
const zoneLabelStyle = new TextStyle({ fill: 0xaeb8c2, fontSize: 10, fontFamily: "monospace", letterSpacing: 1 });
const agentLabelStyle = new TextStyle({ fill: 0xd7e2ee, fontSize: 9, fontFamily: "monospace" });

function drawAgentBody(g: Graphics, shirt: number, legOffset: number): void {
  g.clear();
  g.ellipse(0, 15, 8, 3).fill({ color: 0x000000, alpha: 0.25 });
  g.rect(-5, 4 + legOffset, 4, 8).fill(0x2c3648);
  g.rect(1, 4 - legOffset, 4, 8).fill(0x2c3648);
  g.roundRect(-7, -8, 14, 13, 3).fill(shirt);
}

function drawAgentHead(g: Graphics, facing: 1 | -1): void {
  g.clear();
  g.circle(0, 0, 6).fill(0xe0b088);
  g.circle(2 * facing, -1, 1).fill(0x1a120c);
}

export default function WorldView({ simulationId }: { simulationId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const agentsRef = useRef<Map<string, AgentSprite>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const app = new Application();

    async function setup() {
      await app.init({ width: WIDTH, height: HEIGHT, background: GROUND, antialias: false, resolution: window.devicePixelRatio || 1, autoDensity: true });
      // React 18 StrictMode's dev-only mount->cleanup->mount can unmount
      // before this async init() resolves; destroy()ing an Application that
      // never finished init() throws, so bail out instead of touching
      // app.canvas/app.stage.
      if (cancelled) return;
      initialized = true;
      app.canvas.style.imageRendering = "pixelated";
      if (!hostRef.current) return;
      hostRef.current.appendChild(app.canvas);

      // ---- ground: a full tinted base instead of empty space, plus a
      // faint tile grid so it doesn't read as a flat color fill.
      const ground = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill(GROUND);
      for (let x = 0; x < WIDTH; x += 20) ground.rect(x, 0, 1, HEIGHT).fill({ color: GROUND_LINE, alpha: 0.3 });
      for (let y = 0; y < HEIGHT; y += 20) ground.rect(0, y, WIDTH, 1).fill({ color: GROUND_LINE, alpha: 0.3 });
      app.stage.addChild(ground);

      const zoneLayer = new Container();
      for (const zone of Object.values(ZONES)) {
        zoneLayer.addChild(new Graphics().roundRect(zone.x, zone.y, zone.w, zone.h, 6).fill({ color: zone.soil, alpha: 0.55 }));
        const label = new Text({ text: zone.label, style: zoneLabelStyle });
        label.position.set(zone.x + 8, zone.y + 6);
        zoneLayer.addChild(label);
      }
      app.stage.addChild(zoneLayer);

      const treasury = new Container();
      const treasuryGfx = new Graphics();
      drawTreasury(treasuryGfx);
      treasury.addChild(treasuryGfx);
      treasury.position.set(WIDTH / 2, HEIGHT / 2 + 8);
      app.stage.addChild(treasury);

      const buildingsLayer = new Container();
      app.stage.addChild(buildingsLayer);

      const agentLayer = new Container();
      app.stage.addChild(agentLayer);

      app.ticker.add((ticker) => {
        const now = Date.now();
        for (const sprite of agentsRef.current.values()) {
          const dx = sprite.targetX - sprite.x;
          const dy = sprite.targetY - sprite.y;
          const moving = Math.abs(dx) + Math.abs(dy) > 1;
          sprite.x += dx * 0.06;
          sprite.y += dy * 0.06;
          if (Math.abs(dx) > 0.5) sprite.facing = dx > 0 ? 1 : -1;
          sprite.phase += ticker.deltaTime * (moving ? 0.35 : 0.08);
          const legOffset = moving ? Math.sin(sprite.phase) * 2.5 : 0;
          const bob = moving ? Math.abs(Math.sin(sprite.phase)) * 1.5 : Math.sin(sprite.phase) * 0.8;
          drawAgentBody(sprite.body, sprite.shirt, legOffset);
          sprite.head.position.set(0, -13 - bob);
          drawAgentHead(sprite.head, sprite.facing);
          sprite.container.position.set(sprite.x, sprite.y);
          if (sprite.bubble && now > sprite.bubbleUntil) {
            sprite.container.removeChild(sprite.bubble);
            sprite.bubble.destroy({ children: true });
            sprite.bubble = null;
          }
        }
      });

      async function tick() {
        if (cancelled) return;
        try {
          const [world, decisions] = await Promise.all([api.getWorld(simulationId), api.getDecisions(simulationId, 60)]);
          if (cancelled) return;

          // ---- buildings -------------------------------------------------
          buildingsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
          const businessPos = new Map<string, { x: number; y: number }>();
          for (const b of world.businesses as any[]) {
            const zone = ZONES[b.type as string];
            if (!zone) continue;
            const pt = zonePoint(zone, b.id);
            businessPos.set(b.id, pt);
            const gfx = new Graphics();
            drawBuilding(gfx, zone.roof, zone.body, b.status !== "ACTIVE");
            gfx.position.set(pt.x, pt.y);
            buildingsLayer.addChild(gfx);
          }

          // ---- agents ------------------------------------------------------
          const latestByAgent = new Map<string, any>();
          for (const d of decisions as any[]) {
            const prev = latestByAgent.get(d.agentId);
            if (!prev || d.gameDay > prev.gameDay || (d.gameDay === prev.gameDay && d.createdAt > prev.createdAt)) {
              latestByAgent.set(d.agentId, d);
            }
          }

          const seen = new Set<string>();
          for (const a of world.activeAgents as any[]) {
            seen.add(a.id);
            let sprite = agentsRef.current.get(a.id);
            const home = zonePoint(ZONES.HOME, a.id);
            if (!sprite) {
              const container = new Container();
              const body = new Graphics();
              const head = new Graphics();
              const label = new Text({ text: shortId(a.id, 4), style: agentLabelStyle });
              label.anchor.set(0.5, 0);
              label.position.set(0, 12);
              container.addChild(body, head, label);
              container.position.set(home.x, home.y);
              agentLayer.addChild(container);
              sprite = {
                container,
                body,
                head,
                label,
                bubble: null,
                bubbleUntil: 0,
                x: home.x,
                y: home.y,
                targetX: home.x,
                targetY: home.y,
                facing: 1,
                phase: hash01(a.id, "phase") * 10,
                shirt: 0x7c8ba1,
                lastDecisionId: null,
              };
              agentsRef.current.set(a.id, sprite);
            }

            sprite.shirt = a.employmentStatus === "EMPLOYED" ? 0x4fd1a5 : 0x7c8ba1;

            const latest = latestByAgent.get(a.id);
            let target = home;
            if (latest?.selectedAction?.targetId && businessPos.has(latest.selectedAction.targetId)) {
              target = businessPos.get(latest.selectedAction.targetId)!;
            }
            sprite.targetX = target.x;
            sprite.targetY = target.y;

            if (latest && latest.id !== sprite.lastDecisionId) {
              sprite.lastDecisionId = latest.id;
              if (sprite.bubble) {
                sprite.container.removeChild(sprite.bubble);
                sprite.bubble.destroy({ children: true });
              }
              const text = new Text({ text: `${latest.selectedAction.action}\n(${latest.selectedAction.reasonCode})`, style: bubbleStyle });
              text.position.set(6, 6);
              const bubbleBg = new Graphics()
                .roundRect(0, 0, text.width + 12, text.height + 12, 3)
                .fill({ color: 0xd7e2ee, alpha: 0.95 })
                .stroke({ width: 1, color: 0x4fd1a5 });
              const bubble = new Container();
              bubble.addChild(bubbleBg, text);
              bubble.position.set(-bubble.width / 2, -46);
              sprite.container.addChild(bubble);
              sprite.bubble = bubble;
              sprite.bubbleUntil = Date.now() + 3500;
            }
          }

          for (const [id, sprite] of agentsRef.current) {
            if (!seen.has(id)) {
              sprite.container.destroy({ children: true });
              agentsRef.current.delete(id);
            }
          }
        } catch {
          // transient fetch failure — next poll retries
        }
      }

      await tick();
      const interval = setInterval(tick, 2500);
      (app as any)._econforgeInterval = interval;
    }

    setup();

    return () => {
      cancelled = true;
      const interval = (app as any)._econforgeInterval;
      if (interval) clearInterval(interval);
      agentsRef.current.clear();
      if (initialized) app.destroy(true, { children: true });
    };
  }, [simulationId]);

  return <div ref={hostRef} style={{ borderRadius: 6, overflow: "hidden", lineHeight: 0 }} />;
}
