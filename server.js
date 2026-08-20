require("dotenv").config();
const express = require("express");
const path = require("path");

const {
  INFLUX_URL,
  INFLUX_ORG,
  INFLUX_BUCKET,
  INFLUX_TOKEN,
  INFLUX_MEASUREMENT = "water_parameters",
  PORT = 3000,
} = process.env;

if (!INFLUX_URL || !INFLUX_ORG || !INFLUX_BUCKET || !INFLUX_TOKEN) {
  console.error("Missing InfluxDB config. Check your .env file.");
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

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/log", async (req, res) => {
  const body = req.body || {};
  const fields = {};

  for (const name of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, name)) continue;
    const value = Number(body[name]);
    if (!Number.isFinite(value)) {
      return res.status(400).send(`Invalid value for ${name}`);
    }
    fields[name] = value;
  }

  if (Object.keys(fields).length === 0) {
    return res.status(400).send("No parameters provided.");
  }

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
      console.error("InfluxDB write failed:", influxRes.status, detail);
      return res.status(502).send(`InfluxDB rejected the write (${influxRes.status})`);
    }

    res.status(204).end();
  } catch (err) {
    console.error("InfluxDB write error:", err);
    res.status(502).send("Could not reach InfluxDB.");
  }
});

app.listen(PORT, () => {
  console.log(`Reef Log running at http://localhost:${PORT}`);
});
