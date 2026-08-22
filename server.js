require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const path = require("path");

const LOG_TIME_ZONE = "America/Denver";

function timestamp() {
  const now = new Date();
  const datePart = now.toLocaleString("sv-SE", { timeZone: LOG_TIME_ZONE });
  const tzAbbr = new Intl.DateTimeFormat("en-US", {
    timeZone: LOG_TIME_ZONE,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName").value;
  return `${datePart} ${tzAbbr}`;
}

function log(level, message, meta) {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `${timestamp()} [${level}] ${message}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const {
  INFLUX_URL,
  INFLUX_ORG,
  INFLUX_BUCKET,
  INFLUX_TOKEN,
  INFLUX_MEASUREMENT = "water_parameters",
  PORT = 3000,
} = process.env;

if (!INFLUX_URL || !INFLUX_ORG || !INFLUX_BUCKET || !INFLUX_TOKEN) {
  log("error", "Missing InfluxDB config. Check your .env file.");
  process.exit(1);
}

const ALLOWED_FIELDS = ["alkalinity", "phosphate", "nitrate", "calcium", "magnesium"];

function formatFieldValue(value) {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function toLineProtocol(fields) {
  const parts = ALLOWED_FIELDS
    .filter((name) => Object.prototype.hasOwnProperty.call(fields, name))
    .map((name) => `${name}=${formatFieldValue(fields[name])}`);
  return `${INFLUX_MEASUREMENT} ${parts.join(",")}`;
}

morgan.token("date", () => timestamp());

const app = express();
app.use(
  morgan(':remote-addr - :remote-user [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"')
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/log", async (req, res) => {
  const body = req.body || {};
  const fields = {};

  for (const name of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, name)) continue;
    const value = Number(body[name]);
    if (!Number.isFinite(value)) {
      log("warn", "Rejected write: invalid field value", { field: name, value: body[name] });
      return res.status(400).send(`Invalid value for ${name}`);
    }
    fields[name] = value;
  }

  if (Object.keys(fields).length === 0) {
    log("warn", "Rejected write: no parameters provided");
    return res.status(400).send("No parameters provided.");
  }

  log("info", "Logging parameters", { fields });

  const line = toLineProtocol(fields);
  const writeUrl = `${INFLUX_URL.replace(/\/$/, "")}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=s`;

  try {
    const influxRes = await fetch(writeUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${INFLUX_TOKEN}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: line,
    });

    if (!influxRes.ok) {
      const detail = await influxRes.text().catch(() => "");
      log("error", "InfluxDB write failed", { status: influxRes.status, detail, fields });
      return res.status(502).send(`InfluxDB rejected the write (${influxRes.status})`);
    }

    log("info", "InfluxDB write succeeded", { fields });
    res.status(204).end();
  } catch (err) {
    log("error", "InfluxDB write error", { message: err.message, fields });
    res.status(502).send("Could not reach InfluxDB.");
  }
});

app.listen(PORT, () => {
  log("info", `Reef Log running at http://localhost:${PORT}`);
});
