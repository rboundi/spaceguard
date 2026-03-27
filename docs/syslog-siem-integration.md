# Syslog SIEM Integration

SpaceGuard can forward alerts and incidents to external SIEMs (Splunk,
ArcSight, Elastic SIEM, IBM QRadar, Microsoft Sentinel) via syslog in
CEF, LEEF, or JSON format.

## Supported Formats

### CEF (Common Event Format)

Industry standard supported by Splunk, ArcSight, Elastic SIEM, and
Microsoft Sentinel. Version 0.

```
CEF:0|SpaceGuard|SpaceGuard|1.0|{rule_id}|{title}|{severity}|
  rt={epoch_ms}
  externalId={alert_uuid}
  src={affected_asset_id}
  spt={stream_id}
  cs1Label=sparta_tactic cs1={tactic}
  cs2Label=sparta_technique cs2={technique}
  msg={description}
  cat=Alert
```

Severity mapping: LOW=3, MEDIUM=5, HIGH=7, CRITICAL=10

Example alert:

```
CEF:0|SpaceGuard|SpaceGuard|1.0|SG-TM-001|Battery Voltage Anomaly|7|rt=1711539600000 externalId=a1b2c3d4 src=sat-001 cs1Label=sparta_tactic cs1=TA0040 cs2Label=sparta_technique cs2=T0001 msg=Battery voltage exceeded 3-sigma threshold cat=Alert
```

Example incident:

```
CEF:0|SpaceGuard|SpaceGuard|1.0|INC-a1b2c3d4|Multi-asset Command Injection Campaign|10|rt=1711539600000 externalId=a1b2c3d4 cat=Incident cs1Label=nis2_classification cs1=SIGNIFICANT cs2Label=status cs2=INVESTIGATING msg=Coordinated attack across 3 ground stations
```

### LEEF (Log Event Extended Format)

Native format for IBM QRadar. Uses tab-delimited key=value pairs.
Version 2.0.

```
LEEF:2.0|SpaceGuard|SpaceGuard|1.0|{rule_id}|{tab}
  cat=Alert{tab}
  sev={severity_num}{tab}
  devTime={epoch_ms}{tab}
  externalId={alert_uuid}{tab}
  src={affected_asset_id}{tab}
  spartaTactic={tactic}{tab}
  spartaTechnique={technique}{tab}
  msg={description}
```

### JSON (Generic)

Structured JSON over syslog. Compatible with any SIEM that accepts
JSON (Elastic, Datadog, Sumo Logic, Graylog).

```json
{
  "source": "SpaceGuard",
  "type": "alert",
  "version": "1.0",
  "timestamp": "2026-03-27T12:00:00.000Z",
  "severity": "HIGH",
  "severityNum": 7,
  "eventId": "SG-TM-001",
  "externalId": "a1b2c3d4-...",
  "title": "Battery Voltage Anomaly",
  "description": "Battery voltage exceeded 3-sigma threshold",
  "status": "NEW",
  "streamId": "stream-uuid",
  "affectedAssetId": "asset-uuid",
  "spartaTactic": "TA0040",
  "spartaTechnique": "T0001",
  "metadata": { "z_score": 4.2, "value": 28.1 }
}
```

## Transport Protocols

| Protocol | Default Port | Description |
|----------|-------------|-------------|
| UDP      | 514         | Standard syslog (RFC 5426). Fast, no delivery guarantee. |
| TCP      | 514         | Reliable syslog (RFC 6587). Newline-framed. |
| TLS      | 6514        | Encrypted syslog (RFC 5425). Requires TLS receiver. |

## API Endpoints

### List syslog endpoints

```
GET /api/v1/settings/syslog?organizationId={uuid}
```

### Create syslog endpoint

```
POST /api/v1/settings/syslog
Content-Type: application/json

{
  "organizationId": "uuid",
  "name": "Production Splunk",
  "host": "splunk.internal.example.com",
  "port": 514,
  "protocol": "UDP",
  "format": "CEF",
  "minSeverity": "MEDIUM",
  "isActive": true
}
```

### Update syslog endpoint

```
PUT /api/v1/settings/syslog/{id}
Content-Type: application/json

{
  "isActive": false,
  "minSeverity": "HIGH"
}
```

### Delete syslog endpoint

```
DELETE /api/v1/settings/syslog/{id}
```

### Test connectivity

```
POST /api/v1/settings/syslog/{id}/test

Response: { "success": true } or { "success": false, "error": "..." }
```

### Get format documentation

```
GET /api/v1/settings/syslog/formats
```

Returns detailed specs for each format and protocol.

## SIEM Parser Configuration

### Splunk

In Splunk, navigate to Settings > Data Inputs > UDP/TCP and configure
a new data input listening on the configured port. SpaceGuard uses
the `SpaceGuard` vendor and product name in CEF headers.

Search query: `sourcetype=syslog "CEF:0|SpaceGuard"`

### Elastic SIEM

Use the Filebeat CEF module:

```yaml
filebeat.modules:
  - module: cef
    log:
      enabled: true
      var.syslog_host: 0.0.0.0
      var.syslog_port: 514
```

### IBM QRadar

Use LEEF format. QRadar natively parses LEEF 2.0 with vendor
"SpaceGuard". Create a log source with Log Source Type "Universal LEEF".

### Microsoft Sentinel

Use CEF via the Azure Monitor Agent. Configure a CEF collector that
forwards to your Log Analytics workspace. SpaceGuard events will appear
in the CommonSecurityLog table.
