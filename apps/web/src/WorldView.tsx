import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { api } from "./api.js";
import { shortId } from "./format.js";

const WIDTH = 760;
const HEIGHT = 420;

// Deterministic layout — no coordinates exist anywhere in the backend
// (properties/businesses have no x/y), so positions are derived purely from
// ids on the client, entirely additive on top of the existing API responses.
const ZONES: Record<string, { x: number; y: number; w: number; h: number; label: string; icon: string; color: number }> = {
  FARM: { x: 24, y: 24, w: 320, h: 150, label: "FARMS", icon: "\u{1F33E}", color: 0x4fd1a5 },
  RESTAURANT: { x: 416, y: 24, w: 320, h: 150, label: "RESTAURANTS", icon: "\u{1F37D}", color: 0xe8b04b },
  THEATRE: { x: 24, y: 246, w: 320, h: 150, label: "THEATRES", icon: "\u{1F3AD}", color: 0xa78bfa },
  HOME: { x: 416, y: 246, w: 320, h: 150, label: "AGENTS AT HOME", icon: "\u{1F3E0}", color: 0x7c8ba1 },
};

function hash01(id: string, salt: string): number {
  let h = 0;
  const s = id + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 10000) / 10000;
}

function zonePoint(zone: (typeof ZONES)[string], id: string): { x: number; y: number } {
  const pad = 24;
  return {
    x: zone.x + pad + hash01(id, "x") * (zone.w - pad * 2),
    y: zone.y + pad + 14 + hash01(id, "y") * (zone.h - pad * 2 - 14),
  };
}

interface AgentSprite {
  container: Container;
  dot: Graphics;
  label: Text;
  bubble: Container | null;
  bubbleUntil: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  lastDecisionId: string | null;
}

const bubbleStyle = new TextStyle({ fill: 0x0b0f14, fontSize: 11, fontFamily: "monospace", wordWrap: true, wordWrapWidth: 150 });
const zoneLabelStyle = new TextStyle({ fill: 0x7c8ba1, fontSize: 10, fontFamily: "monospace", letterSpacing: 1 });
const buildingIconStyle = new TextStyle({ fontSize: 20 });
const agentLabelStyle = new TextStyle({ fill: 0x0b0f14, fontSize: 9, fontFamily: "monospace", fontWeight: "bold" });

export default function WorldView({ simulationId }: { simulationId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const agentsRef = useRef<Map<string, AgentSprite>>(new Map());
  const buildingsLayerRef = useRef<Container | null>(null);

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const app = new Application();
    appRef.current = app;

    async function setup() {
      await app.init({ width: WIDTH, height: HEIGHT, background: "#05080c", antialias: true });
      // React 18 StrictMode's dev-only mount->cleanup->mount can unmount
      // before this async init() resolves; destroy()ing an Application that
      // never finished init() throws (it's missing internals init() sets
      // up), so bail out here instead of touching app.canvas/app.stage.
      if (cancelled) return;
      initialized = true;
      if (!hostRef.current) return;
      hostRef.current.appendChild(app.canvas);

      const zoneLayer = new Container();
      for (const zone of Object.values(ZONES)) {
        const box = new Graphics().roundRect(zone.x, zone.y, zone.w, zone.h, 8).stroke({ width: 1, color: 0x223042 });
        zoneLayer.addChild(box);
        const label = new Text({ text: `${zone.icon} ${zone.label}`, style: zoneLabelStyle });
        label.position.set(zone.x + 8, zone.y + 6);
        zoneLayer.addChild(label);
      }
      app.stage.addChild(zoneLayer);

      const treasury = new Container();
      const treasuryDot = new Graphics().circle(0, 0, 22).fill({ color: 0x1a222d }).stroke({ width: 2, color: 0x4fd1a5 });
      const treasuryIcon = new Text({ text: "\u{1F3E6}", style: buildingIconStyle });
      treasuryIcon.anchor.set(0.5);
      treasury.addChild(treasuryDot, treasuryIcon);
      treasury.position.set(WIDTH / 2, HEIGHT / 2);
      app.stage.addChild(treasury);

      const buildingsLayer = new Container();
      buildingsLayerRef.current = buildingsLayer;
      app.stage.addChild(buildingsLayer);

      const agentLayer = new Container();
      app.stage.addChild(agentLayer);

      app.ticker.add(() => {
        const now = Date.now();
        for (const sprite of agentsRef.current.values()) {
          sprite.x += (sprite.targetX - sprite.x) * 0.06;
          sprite.y += (sprite.targetY - sprite.y) * 0.06;
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
            const dim = b.status !== "ACTIVE";
            const box = new Graphics()
              .roundRect(-16, -16, 32, 32, 6)
              .fill({ color: dim ? 0x1a222d : zone.color, alpha: dim ? 0.3 : 0.85 })
              .stroke({ width: 1, color: dim ? 0x223042 : zone.color });
            const icon = new Text({ text: zone.icon, style: buildingIconStyle });
            icon.anchor.set(0.5);
            icon.alpha = dim ? 0.4 : 1;
            const container = new Container();
            container.addChild(box, icon);
            container.position.set(pt.x, pt.y);
            buildingsLayer.addChild(container);
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
              const dot = new Graphics();
              const label = new Text({ text: shortId(a.id, 4), style: agentLabelStyle });
              label.anchor.set(0.5);
              container.addChild(dot, label);
              container.position.set(home.x, home.y);
              agentLayer.addChild(container);
              sprite = { container, dot, label, bubble: null, bubbleUntil: 0, x: home.x, y: home.y, targetX: home.x, targetY: home.y, lastDecisionId: null };
              agentsRef.current.set(a.id, sprite);
            }

            const employed = a.employmentStatus === "EMPLOYED";
            sprite.dot.clear().circle(0, 0, 12).fill({ color: employed ? 0x4fd1a5 : 0x7c8ba1 }).stroke({ width: 1, color: 0x05080c });

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
                .roundRect(0, 0, text.width + 12, text.height + 12, 5)
                .fill({ color: 0xd7e2ee, alpha: 0.95 })
                .stroke({ width: 1, color: 0x4fd1a5 });
              const bubble = new Container();
              bubble.addChild(bubbleBg, text);
              bubble.position.set(-bubble.width / 2, -44);
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
      appRef.current = null;
    };
  }, [simulationId]);

  return <div ref={hostRef} style={{ borderRadius: 6, overflow: "hidden", lineHeight: 0 }} />;
}
