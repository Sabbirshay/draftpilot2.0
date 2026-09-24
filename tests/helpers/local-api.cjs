const {
  AdminController,
} = require("../../packages/api/dist/admin.controller.js");
// Test-only PostgREST/Auth transport adapter. Production controllers, guard, SQL,
// retrieval, quota and draft completion execute unchanged against real PGlite.
const { PGlite } = require("@electric-sql/pglite");
const { vector } = require("@electric-sql/pglite-pgvector");
const { readFile, readdir } = require("node:fs/promises");
const { createServer } = require("node:http");
const config = require("../../packages/api/dist/config.js");
const { AuthGuard } = require("../../packages/api/dist/auth.js");
const {
  WorkspaceController,
} = require("../../packages/api/dist/workspace.controller.js");
const {
  DraftsController,
} = require("../../packages/api/dist/drafts.controller.js");
const {
  PlatformController,
} = require("../../packages/api/dist/platform.controller.js");
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const testBearer = "local_fixture_verified_access_token_only";
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Error("Invalid SQL identifier");
  return '"' + s + '"';
};
const adminId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminBearer =
  "fixture." +
  Buffer.from(JSON.stringify({ aal: "aal2" })).toString("base64url") +
  ".verified_admin_token";
const weakAdminBearer =
  "fixture." +
  Buffer.from(JSON.stringify({ aal: "aal1" })).toString("base64url") +
  ".verified_admin_token";
async function startLocalApi() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
  );
  for (const migration of (await readdir("packages/api/supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(
      await readFile("packages/api/supabase/migrations/" + migration, "utf8"),
    );
  }
  await db.query("insert into auth.users values($1)", [userId]);
  const team = (
    await db.query(
      "select provision_workspace($1,'agent@example.com','Fixture Support') id",
      [userId],
    )
  ).rows[0].id;
  await db.query(
    "update teams set tone='empathetic',monthly_draft_limit=1000 where id=$1",
    [team],
  );
  const user = {
    id: userId,
    email: "agent@example.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: {},
  };
  await db.query("insert into auth.users values($1)", [adminId]);
  const adminUser = {
    id: adminId,
    email: "admin@example.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { platform_admin: true },
  };
  const requests = [];
  const client = {
    auth: {
      getUser: async (token) => ({
        data: {
          user:
            token === testBearer
              ? user
              : [adminBearer, weakAdminBearer].includes(token)
                ? adminUser
                : null,
        },
        error: [testBearer, adminBearer, weakAdminBearer].includes(token)
          ? null
          : { message: "Invalid token" },
      }),
      admin: {
        getUserById: async (id) => ({
          data: { user: id === userId ? user : null },
        }),
      },
    },
    async rpc(name, args) {
      try {
        const entries = Object.entries(args);
        const r = await db.query(
          `select public.${ident(name)}(${entries.map(([key], i) => ident(key) + " => $" + (i + 1)).join(",")}) result`,
          entries.map(([, v]) => v),
        );
        return { data: r.rows[0]?.result, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    from(table) {
      let method = "select",
        cols = "*",
        vals,
        filters = [],
        params = [],
        limit = "",
        order = "",
        one = false,
        maybe = false,
        count = false,
        head = false;
      const param = (v) => {
        params.push(
          v && typeof v === "object" && !Array.isArray(v)
            ? JSON.stringify(v)
            : v,
        );
        return "$" + params.length;
      };
      const query = {
        select(s = "*", options = {}) {
          cols = s;
          count = !!options.count;
          head = !!options.head;
          return query;
        },
        eq(k, v) {
          filters.push(
            ident(k) + "=" + param(k === "sources" ? JSON.stringify(v) : v),
          );
          return query;
        },
        gt(k, v) {
          filters.push(ident(k) + ">" + param(v));
          return query;
        },
        is(k, v) {
          if (v !== null) throw Error("Unsupported fixture is");
          filters.push(ident(k) + " is null");
          return query;
        },
        in(k, v) {
          filters.push(ident(k) + " in (" + v.map(param).join(",") + ")");
          return query;
        },
        order(k, { ascending = true } = {}) {
          order = " order by " + ident(k) + (ascending ? " asc" : " desc");
          return query;
        },
        limit(n) {
          limit = " limit " + Number(n);
          return query;
        },
        single() {
          one = true;
          return query;
        },
        maybeSingle() {
          one = true;
          maybe = true;
          return query;
        },
        update(v) {
          method = "update";
          vals = v;
          return query;
        },
        insert(v) {
          method = "insert";
          vals = v;
          return query;
        },
        delete() {
          method = "delete";
          return query;
        },
        async then(resolve, reject) {
          try {
            const where = filters.length
              ? " where " + filters.join(" and ")
              : "";
            const selected =
              cols === "*" ? "*" : cols.split(",").map(ident).join(",");
            let sql;
            if (method === "select")
              sql = `select ${count ? "count(*)::int as total" : selected} from public.${ident(table)}${where}${order}${limit}`;
            if (method === "update")
              sql = `update public.${ident(table)} set ${Object.entries(vals)
                .map(
                  ([k, v]) =>
                    ident(k) +
                    "=" +
                    param(k === "sources" ? JSON.stringify(v) : v),
                )
                .join(",")}${where} returning ${selected}`;
            if (method === "delete")
              sql = `delete from public.${ident(table)}${where} returning ${selected}`;
            if (method === "insert")
              sql = `insert into public.${ident(table)} (${Object.keys(vals).map(ident).join(",")}) values (${Object.values(vals).map(param).join(",")}) returning ${selected}`;
            const result = await db.query(sql, params);
            if (one && !maybe && result.rows.length !== 1)
              throw Error("Expected one record");
            return resolve({
              data: head ? null : one ? result.rows[0] || null : result.rows,
              error: null,
              count: count ? result.rows[0]?.total : undefined,
            });
          } catch (e) {
            return resolve({ data: null, error: { message: e.message } });
          }
        },
      };
      return query;
    },
  };
  config.serviceDb = () => client;
  const workspace = new WorkspaceController(),
    drafts = new DraftsController(),
    platform = new PlatformController(),
    admin = new AdminController(),
    guard = new AuthGuard();
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    try {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 220000) throw Error("Too large");
      }
      const body = text ? JSON.parse(text) : {};
      req.path = new URL(req.url, "http://localhost").pathname;
      requests.push({ path: req.path, body });
      let result;
      if (req.path === "/extension/exchange")
        result = await platform.exchange(req, body);
      else {
        await guard.canActivate({
          switchToHttp: () => ({ getRequest: () => req }),
        });
        if (req.path === "/admin/overview")
          result = await admin.overview(
            req,
            Object.fromEntries(
              new URL(req.url, "http://localhost").searchParams,
            ),
          );
        else if (req.path === "/admin/pipeline" && req.method === "GET")
          result = await admin.pipeline(req);
        else if (req.path === "/admin/pipeline" && req.method === "PATCH")
          result = await admin.updatePipeline(req, body);
        else if (req.path === "/admin/providers")
          result = await admin.providers(req);
        else if (
          /^\/admin\/providers\/(openai|openrouter)\/(connect|test|activate)$/.test(
            req.path,
          )
        ) {
          const [, , , provider, action] = req.path.split("/");
          result = await admin[
            action === "connect"
              ? "connectProvider"
              : action === "test"
                ? "testProvider"
                : "activateProvider"
          ](req, provider, body);
        } else if (req.path === "/admin/pipeline/test")
          result = await admin.test(req, body);
        else if (req.path.startsWith("/admin/users/") && req.method === "PATCH")
          result = await admin.user(req, req.path.split("/").pop(), body);
        else if (
          req.path.startsWith("/admin/workspaces/") &&
          req.method === "PATCH"
        )
          result = await admin.workspace(req, req.path.split("/").pop(), body);
        else if (req.path === "/knowledge" && req.method === "POST")
          result = await workspace.knowledge(req, body);
        else if (req.path === "/extension/pair")
          result = await workspace.pair(req);
        else if (req.path === "/extension/sessions" && req.method === "DELETE")
          result = await workspace.revokeAll(req);
        else if (req.path === "/drafts/generate")
          result = await drafts.generate(req, body);
        else if (req.path === "/workspace")
          result = await workspace.workspace(req);
        else {
          res.writeHead(404).end();
          return;
        }
      }
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify(result));
    } catch (e) {
      res
        .writeHead(e.getStatus?.() || 500, {
          "Content-Type": "application/json",
        })
        .end(JSON.stringify({ message: e.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  return {
    url,
    db,
    team,
    requests,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}

module.exports = {
  startLocalApi,
  testBearer,
  adminBearer,
  weakAdminBearer,
  adminId,
  userId,
};
