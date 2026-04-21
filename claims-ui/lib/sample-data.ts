import path from "path"
import fs from "fs"
import type { Case, Attachment, Shipment, Order, Invoice } from "./types"

const SAMPLE = path.join(process.cwd(), "..", "sample")

function read<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T
}

export function getCases(): Case[] {
  return read<{ cases: Case[] }>(path.join(SAMPLE, "cases.json")).cases
}

export function getCase(caseId: string): Case {
  return read<Case>(path.join(SAMPLE, "cases", `${caseId}.json`))
}

export function getAttachments(caseId: string): Attachment[] {
  return read<{ attachments: Attachment[] }>(
    path.join(SAMPLE, "cases", `${caseId}_attachments.json`)
  ).attachments
}

export function getShipment(shipmentId: string): Shipment {
  return read<Shipment>(path.join(SAMPLE, "shipments", `${shipmentId}.json`))
}

export function getOrder(orderId: string): Order {
  return read<Order>(path.join(SAMPLE, "orders", `${orderId}.json`))
}

export function getInvoice(caseId: string): Invoice {
  return read<Invoice>(path.join(SAMPLE, "invoices", `${caseId}_invoice.json`))
}
