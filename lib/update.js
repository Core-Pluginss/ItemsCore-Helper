"use strict"

const https = require("https")

function cmpSemver(a, b) {
  const pa = String(a).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split("-")[0].split(".").map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

function fetchLatest(pkg, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => {
      if (done) return
      done = true
      resolve(v)
    }
    try {
      const req = https.get(
        "https://registry.npmjs.org/" + pkg + "/latest",
        { headers: { accept: "application/vnd.npm.install-v1+json" } },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume()
            return finish(null)
          }
          let body = ""
          res.setEncoding("utf8")
          res.on("data", (c) => {
            body += c
            if (body.length > 1e6) req.destroy()
          })
          res.on("end", () => {
            try {
              finish(JSON.parse(body).version || null)
            } catch {
              finish(null)
            }
          })
        }
      )
      req.on("error", () => finish(null))
      req.setTimeout(timeoutMs || 1500, () => {
        req.destroy()
        finish(null)
      })
    } catch {
      finish(null)
    }
  })
}

// Returns { current, latest, outdated } or null if the check could not run
// (offline, timeout, registry error). Never throws.
async function checkForUpdate(currentVersion, timeoutMs) {
  const latest = await fetchLatest("itemscore-helper", timeoutMs)
  if (!latest) return null
  return { current: String(currentVersion), latest: String(latest), outdated: cmpSemver(currentVersion, latest) < 0 }
}

module.exports = { checkForUpdate, cmpSemver }
