/**
 * Unit tests for the CCSDS Space Packet Protocol parser.
 *
 * Run with:
 *   npx tsx --test apps/api/src/services/telemetry/ccsds-parser.test.ts
 *
 * All packets are hand-crafted byte-by-byte to verify exact bit manipulation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCcsdsPacket,
  parseCcsdsStream,
  CcsdsParseError,
} from "./ccsds-parser.ts";

// ---------------------------------------------------------------------------
// Helpers for building test packets
// ---------------------------------------------------------------------------

/**
 * Builds a minimal 6-byte primary header.
 *
 * @param apid       Application Process ID (0-2047)
 * @param packetType 0 = TM, 1 = TC
 * @param secHdr     1 = secondary header present, 0 = absent
 * @param seqFlags   0b00=CONT, 0b01=FIRST, 0b10=LAST, 0b11=STANDALONE
 * @param seqCount   Sequence count (0-16383)
 * @param dataLen    dataLength field value (data bytes - 1)
 */
function buildPrimaryHeader(
  apid: number,
  packetType: 0 | 1,
  secHdr: 0 | 1,
  seqFlags: 0 | 1 | 2 | 3,
  seqCount: number,
  dataLen: number
): Buffer {
  const hdr = Buffer.alloc(6);

  // Byte 0-1: version(3b=000) | type(1b) | secHdr(1b) | apid(11b)
  const word0 = (packetType << 12) | (secHdr << 11) | (apid & 0x07ff);
  hdr.writeUInt16BE(word0, 0);

  // Byte 2-3: seqFlags(2b) | seqCount(14b)
  const word1 = ((seqFlags & 0x03) << 14) | (seqCount & 0x3fff);
  hdr.writeUInt16BE(word1, 2);

  // Byte 4-5: dataLength
  hdr.writeUInt16BE(dataLen, 4);

  return hdr;
}

/** Builds a 6-byte CUC secondary header */
function buildSecondaryHeader(coarse: number, fine: number): Buffer {
  const buf = Buffer.alloc(6);
  buf.writeUInt32BE(coarse, 0); // bytes 0-3: coarse time
  buf.writeUInt16BE(fine, 4);   // bytes 4-5: fine time
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseCcsdsPacket", () => {
  it("parses a valid TM standalone packet", () => {
    // Build: TM, no secondary header, APID=100, standalone, count=42, 4 user data bytes
    const userdata = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const hdr = buildPrimaryHeader(100, 0, 0, 0b11, 42, userdata.length - 1);
    const pkt = parseCcsdsPacket(Buffer.concat([hdr, userdata]));

    assert.equal(pkt.version, 0);
    assert.equal(pkt.type, "TM");
    assert.equal(pkt.hasSecondaryHeader, false);
    assert.equal(pkt.apid, 100);
    assert.equal(pkt.isIdle, false);
    assert.equal(pkt.sequenceFlags, "STANDALONE");
    assert.equal(pkt.sequenceCount, 42);
    assert.equal(pkt.dataLength, 3); // 4 bytes - 1
    assert.deepEqual(pkt.dataField, userdata);
    assert.equal(pkt.raw.length, 10); // 6 header + 4 data
    assert.equal(pkt.secondaryHeader, undefined);
  });

  it("parses a valid TC packet", () => {
    const userdata = Buffer.from([0x01, 0x02]);
    const hdr = buildPrimaryHeader(200, 1, 0, 0b11, 1, userdata.length - 1);
    const pkt = parseCcsdsPacket(Buffer.concat([hdr, userdata]));

    assert.equal(pkt.type, "TC");
    assert.equal(pkt.apid, 200);
    assert.equal(pkt.sequenceCount, 1);
  });

  it("parses a packet with a secondary header", () => {
    // CUC: 1_000_000 seconds coarse, 32768 fine (0.5 sub-second)
    const coarseTime = 1_000_000;
    const fineTime = 32768;
    const secHdr = buildSecondaryHeader(coarseTime, fineTime);
    const userData = Buffer.from([0xaa, 0xbb]);
    const dataField = Buffer.concat([secHdr, userData]);
    const hdr = buildPrimaryHeader(55, 0, 1, 0b11, 7, dataField.length - 1);
    const raw = Buffer.concat([hdr, dataField]);
    const pkt = parseCcsdsPacket(raw);

    assert.equal(pkt.hasSecondaryHeader, true);
    assert.ok(pkt.secondaryHeader !== undefined);
    assert.equal(pkt.secondaryHeader.coarseTime, coarseTime);
    assert.equal(pkt.secondaryHeader.fineTime, fineTime);
    assert.deepEqual(
      pkt.secondaryHeader.timestamp,
      new Date(coarseTime * 1000)
    );
    assert.equal(pkt.secondaryHeader.raw.length, 6);
    // dataField is the full data section (secHdr + userData)
    assert.equal(pkt.dataField.length, dataField.length);
  });

  it("flags idle packet (APID 2047)", () => {
    const userdata = Buffer.alloc(1, 0xff);
    const hdr = buildPrimaryHeader(2047, 0, 0, 0b11, 0, 0);
    const pkt = parseCcsdsPacket(Buffer.concat([hdr, userdata]));

    assert.equal(pkt.apid, 2047);
    assert.equal(pkt.isIdle, true);
    // Idle packets are returned, not discarded
    assert.ok(pkt !== null);
  });

  it("correctly parses all four sequence flag values", () => {
    const data = Buffer.alloc(1);
    const cases: Array<[0 | 1 | 2 | 3, "CONTINUATION" | "FIRST" | "LAST" | "STANDALONE"]> = [
      [0b00, "CONTINUATION"],
      [0b01, "FIRST"],
      [0b10, "LAST"],
      [0b11, "STANDALONE"],
    ];
    for (const [bits, expected] of cases) {
      const hdr = buildPrimaryHeader(1, 0, 0, bits, 0, 0);
      const pkt = parseCcsdsPacket(Buffer.concat([hdr, data]));
      assert.equal(pkt.sequenceFlags, expected, `flags for ${bits.toString(2).padStart(2, "0")}`);
    }
  });

  it("parses maximum APID (2046) without treating as idle", () => {
    const data = Buffer.alloc(1);
    const hdr = buildPrimaryHeader(2046, 0, 0, 0b11, 0, 0);
    const pkt = parseCcsdsPacket(Buffer.concat([hdr, data]));
    assert.equal(pkt.apid, 2046);
    assert.equal(pkt.isIdle, false);
  });

  it("throws CcsdsParseError for invalid version", () => {
    // Manually set version bits 13-15 to 001 (version 1 is invalid)
    const buf = Buffer.alloc(7);
    // Set version = 1: bits [15:13] of byte 0-1 -> 0b001_0_0_00000000000 = 0x2000
    buf.writeUInt16BE(0x2000, 0); // version=1
    buf.writeUInt16BE(0xc000, 2); // standalone, count=0
    buf.writeUInt16BE(0, 4);      // dataLength=0
    buf[6] = 0x00;

    assert.throws(
      () => parseCcsdsPacket(buf),
      (err: unknown) => err instanceof CcsdsParseError && /version/i.test((err as Error).message)
    );
  });

  it("throws CcsdsParseError for buffer shorter than minimum", () => {
    const buf = Buffer.alloc(6); // one byte short of minimum (6 header + 1 data)
    assert.throws(
      () => parseCcsdsPacket(buf),
      (err: unknown) => err instanceof CcsdsParseError && /too short/i.test((err as Error).message)
    );
  });

  it("only reads packet bytes even when buffer is larger", () => {
    // Packet declares 2 data bytes, but buffer has 20 bytes
    const data = Buffer.from([0x01, 0x02]);
    const hdr = buildPrimaryHeader(10, 0, 0, 0b11, 0, data.length - 1);
    const extra = Buffer.alloc(14, 0xff);
    const pkt = parseCcsdsPacket(Buffer.concat([hdr, data, extra]));

    // raw should only contain the 8 packet bytes (6 header + 2 data)
    assert.equal(pkt.raw.length, 8);
    assert.deepEqual(pkt.dataField, data);
  });
});

describe("parseCcsdsStream", () => {
  it("parses multiple concatenated packets", () => {
    const p1data = Buffer.from([0x01, 0x02, 0x03]);
    const p2data = Buffer.from([0xaa, 0xbb]);
    const p3data = Buffer.from([0xff]);

    const h1 = buildPrimaryHeader(10, 0, 0, 0b11, 1, p1data.length - 1);
    const h2 = buildPrimaryHeader(20, 1, 0, 0b01, 2, p2data.length - 1);
    const h3 = buildPrimaryHeader(30, 0, 0, 0b10, 3, p3data.length - 1);

    const stream = Buffer.concat([h1, p1data, h2, p2data, h3, p3data]);
    const packets = parseCcsdsStream(stream);

    assert.equal(packets.length, 3);

    assert.equal(packets[0].apid, 10);
    assert.equal(packets[0].type, "TM");
    assert.equal(packets[0].sequenceCount, 1);
    assert.deepEqual(packets[0].dataField, p1data);

    assert.equal(packets[1].apid, 20);
    assert.equal(packets[1].type, "TC");
    assert.equal(packets[1].sequenceCount, 2);
    assert.deepEqual(packets[1].dataField, p2data);

    assert.equal(packets[2].apid, 30);
    assert.equal(packets[2].sequenceCount, 3);
    assert.deepEqual(packets[2].dataField, p3data);
  });

  it("handles truncated buffer gracefully (returns parsed packets so far)", () => {
    const p1data = Buffer.from([0xde, 0xad]);
    const h1 = buildPrimaryHeader(5, 0, 0, 0b11, 0, p1data.length - 1);
    // Second "packet" is only 3 bytes (truncated primary header, not enough for a packet)
    const truncated = Buffer.from([0x00, 0x05, 0xc0]);

    const stream = Buffer.concat([h1, p1data, truncated]);
    const packets = parseCcsdsStream(stream);

    // Only the complete first packet should be returned
    assert.equal(packets.length, 1);
    assert.equal(packets[0].apid, 5);
  });

  it("handles a packet whose declared data extends beyond buffer end", () => {
    // Declare 10 data bytes but only provide 4
    const hdr = buildPrimaryHeader(7, 0, 0, 0b11, 0, 9); // dataLength=9 means 10 bytes expected
    const shortData = Buffer.alloc(4, 0xab);
    const stream = Buffer.concat([hdr, shortData]);

    const packets = parseCcsdsStream(stream);
    // Incomplete packet - nothing should be returned
    assert.equal(packets.length, 0);
  });

  it("returns empty array for empty buffer", () => {
    const packets = parseCcsdsStream(Buffer.alloc(0));
    assert.equal(packets.length, 0);
  });

  it("returns empty array for buffer smaller than minimum packet size", () => {
    const packets = parseCcsdsStream(Buffer.alloc(5));
    assert.equal(packets.length, 0);
  });

  it("includes idle packets in stream output", () => {
    const data = Buffer.alloc(1, 0x00);
    const h = buildPrimaryHeader(2047, 0, 0, 0b11, 0, 0);
    const packets = parseCcsdsStream(Buffer.concat([h, data]));

    assert.equal(packets.length, 1);
    assert.equal(packets[0].isIdle, true);
  });

  it("parses a realistic housekeeping telemetry frame (TM, sec header, APID=100)", () => {
    // Simulate a housekeeping frame: secondary header + 12 bytes of HK data
    const coarse = 1_740_000_000; // plausible UNIX timestamp
    const fine = 0x8000;          // 0.5 seconds
    const secHdr = buildSecondaryHeader(coarse, fine);
    const hkData = Buffer.from([
      0x10, 0x00, // battery voltage: 4096 (raw ADC)
      0x0f, 0xa0, // solar power: 4000
      0x00, 0x80, // bus current: 128
      0x3f, 0x00, // cpu load: 63%
      0x00, 0x01, // memory free: 1 (MB)
      0x19, 0x00, // temperature OBC: 25 C
    ]);
    const dataField = Buffer.concat([secHdr, hkData]);
    const hdr = buildPrimaryHeader(100, 0, 1, 0b11, 1234, dataField.length - 1);
    const raw = Buffer.concat([hdr, dataField]);

    const packets = parseCcsdsStream(raw);
    assert.equal(packets.length, 1);

    const pkt = packets[0];
    assert.equal(pkt.apid, 100);
    assert.equal(pkt.type, "TM");
    assert.equal(pkt.hasSecondaryHeader, true);
    assert.equal(pkt.sequenceCount, 1234);
    assert.equal(pkt.sequenceFlags, "STANDALONE");
    assert.ok(pkt.secondaryHeader !== undefined);
    assert.equal(pkt.secondaryHeader.coarseTime, coarse);
    assert.equal(pkt.secondaryHeader.fineTime, fine);
    assert.equal(pkt.dataField.length, dataField.length);
  });
});
