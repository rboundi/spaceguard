/**
 * CCSDS Space Packet Protocol (CCSDS 133.0-B-2) Parser
 *
 * PRIMARY HEADER (6 bytes / 48 bits):
 *   Bits 0-2:   Packet Version Number (3 bits, always 000)
 *   Bit  3:     Packet Type (0 = TM telemetry, 1 = TC telecommand)
 *   Bit  4:     Secondary Header Flag (1 = present)
 *   Bits 5-15:  Application Process ID / APID (11 bits, 0-2047)
 *   Bits 16-17: Sequence Flags (2 bits)
 *   Bits 18-31: Packet Sequence Count (14 bits, 0-16383)
 *   Bits 32-47: Packet Data Length (16 bits, = data field octets - 1)
 *
 * SECONDARY HEADER (variable, typically 6 bytes for CUC timestamp):
 *   Bytes 0-3:  Coarse time (seconds since mission epoch, big-endian uint32)
 *   Bytes 4-5:  Fine time (sub-second resolution, big-endian uint16)
 *
 * DATA FIELD:
 *   Application-defined content, length = Packet Data Length + 1 bytes.
 *   When secondary header is present, data field = secondary header + user data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PacketType = "TM" | "TC";

export type SequenceFlags =
  | "FIRST"
  | "CONTINUATION"
  | "LAST"
  | "STANDALONE";

export interface SecondaryHeader {
  /** CUC coarse time: seconds since mission epoch (big-endian uint32) */
  coarseTime: number;
  /** CUC fine time: sub-second units (big-endian uint16) */
  fineTime: number;
  /** Reconstructed Date from CUC coarse time (seconds interpreted as UNIX epoch) */
  timestamp: Date;
  /** Raw secondary header bytes */
  raw: Buffer;
}

export interface CcsdsPacket {
  /** Packet Version Number (always 0 for valid CCSDS packets) */
  version: number;
  /** Telemetry (0) or Telecommand (1) */
  type: PacketType;
  /** Whether a secondary header is present */
  hasSecondaryHeader: boolean;
  /** Application Process Identifier (0-2047). APID 2047 = idle packet. */
  apid: number;
  /** Whether this is an idle packet (APID 2047) */
  isIdle: boolean;
  /** Packet sequencing within a sequence group */
  sequenceFlags: SequenceFlags;
  /** Rolling counter 0-16383 */
  sequenceCount: number;
  /**
   * Number of octets in data field minus 1.
   * Total packet length = 6 (primary header) + dataLength + 1.
   */
  dataLength: number;
  /** Parsed secondary header (present when hasSecondaryHeader is true) */
  secondaryHeader?: SecondaryHeader;
  /**
   * The full data field buffer (secondary header bytes + user data).
   * When hasSecondaryHeader is true this starts at byte 6 of the raw packet.
   */
  dataField: Buffer;
  /** The complete raw packet bytes */
  raw: Buffer;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CcsdsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CcsdsParseError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum valid CCSDS packet size: 6 primary header bytes + 1 data byte */
const MIN_PACKET_BYTES = 7;

/** CCSDS version number must be 0b000 */
const VALID_VERSION = 0;

/** APID value reserved for idle / fill packets */
const IDLE_APID = 2047;

/** Standard CUC secondary header length when present (4 coarse + 2 fine) */
const SECONDARY_HEADER_BYTES = 6;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads the 16-bit sequence control word and extracts flags + count.
 * Sequence flags occupying bits [15:14] of the word:
 *   01 = FIRST, 00 = CONTINUATION, 10 = LAST, 11 = STANDALONE
 */
function parseSequenceControl(word: number): {
  sequenceFlags: SequenceFlags;
  sequenceCount: number;
} {
  const flagBits = (word >> 14) & 0x03;
  const count = word & 0x3fff;

  const flagMap: Record<number, SequenceFlags> = {
    0b01: "FIRST",
    0b00: "CONTINUATION",
    0b10: "LAST",
    0b11: "STANDALONE",
  };

  return {
    sequenceFlags: flagMap[flagBits] ?? "STANDALONE",
    sequenceCount: count,
  };
}

/**
 * Parses the 6-byte CUC secondary header.
 * Assumes the buffer starts exactly at the secondary header.
 */
function parseSecondaryHeader(buf: Buffer, offset: number): SecondaryHeader {
  const coarseTime = buf.readUInt32BE(offset);
  const fineTime = buf.readUInt16BE(offset + 4);
  // Treat coarse time as UNIX epoch seconds for human-readable timestamps.
  const timestamp = new Date(coarseTime * 1000);
  const raw = buf.subarray(offset, offset + SECONDARY_HEADER_BYTES);

  return { coarseTime, fineTime, timestamp, raw: Buffer.from(raw) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a single CCSDS Space Packet from the provided buffer.
 *
 * @param buffer - Buffer containing exactly one CCSDS packet (or more bytes;
 *                 only the bytes belonging to this packet are consumed).
 * @returns Parsed CcsdsPacket.
 * @throws {CcsdsParseError} If the buffer is too short or version is invalid.
 */
export function parseCcsdsPacket(buffer: Buffer): CcsdsPacket {
  if (buffer.length < MIN_PACKET_BYTES) {
    throw new CcsdsParseError(
      `Buffer too short: need at least ${MIN_PACKET_BYTES} bytes, got ${buffer.length}`
    );
  }

  // ---- Primary Header ----
  // Byte 0-1: version (3b) | type (1b) | secHdrFlag (1b) | apid (11b)
  const word0 = buffer.readUInt16BE(0);
  const version = (word0 >> 13) & 0x07;
  const packetTypeBit = (word0 >> 12) & 0x01;
  const secHdrFlag = (word0 >> 11) & 0x01;
  const apid = word0 & 0x07ff;

  if (version !== VALID_VERSION) {
    throw new CcsdsParseError(
      `Invalid CCSDS version: expected ${VALID_VERSION}, got ${version}`
    );
  }

  // Byte 2-3: sequence flags (2b) | sequence count (14b)
  const word1 = buffer.readUInt16BE(2);
  const { sequenceFlags, sequenceCount } = parseSequenceControl(word1);

  // Byte 4-5: data length (number of data field octets minus 1)
  const dataLength = buffer.readUInt16BE(4);
  const totalPacketBytes = 6 + dataLength + 1;

  // Slice the raw packet bytes (may be a sub-window of a larger buffer)
  const raw = Buffer.from(buffer.subarray(0, totalPacketBytes));

  // The data field starts immediately after the primary header
  const dataField = Buffer.from(buffer.subarray(6, totalPacketBytes));

  // ---- Secondary Header ----
  let secondaryHeader: SecondaryHeader | undefined;
  if (secHdrFlag === 1 && dataField.length >= SECONDARY_HEADER_BYTES) {
    secondaryHeader = parseSecondaryHeader(buffer, 6);
  }

  return {
    version,
    type: packetTypeBit === 0 ? "TM" : "TC",
    hasSecondaryHeader: secHdrFlag === 1,
    apid,
    isIdle: apid === IDLE_APID,
    sequenceFlags,
    sequenceCount,
    dataLength,
    secondaryHeader,
    dataField,
    raw,
  };
}

/**
 * Parses a buffer that may contain multiple concatenated CCSDS packets.
 *
 * Uses the dataLength field in each primary header to advance through the
 * buffer and find packet boundaries. Stops cleanly when there are not enough
 * bytes left to form another complete packet (incomplete tail packet).
 *
 * @param buffer - Buffer containing one or more CCSDS packets.
 * @returns Array of parsed packets in order of appearance.
 * @throws {CcsdsParseError} If a packet header contains an invalid version.
 */
export function parseCcsdsStream(buffer: Buffer): CcsdsPacket[] {
  const packets: CcsdsPacket[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const remaining = buffer.length - offset;

    // Need at least a primary header to determine packet length
    if (remaining < MIN_PACKET_BYTES) {
      // Incomplete packet at end of buffer - stop here
      break;
    }

    // Peek at dataLength before full parse to check we have enough bytes
    const dataLength = buffer.readUInt16BE(offset + 4);
    const totalPacketBytes = 6 + dataLength + 1;

    if (remaining < totalPacketBytes) {
      // Incomplete packet at end of buffer - stop here
      break;
    }

    const packet = parseCcsdsPacket(buffer.subarray(offset));
    packets.push(packet);
    offset += totalPacketBytes;
  }

  return packets;
}
