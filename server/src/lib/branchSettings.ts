import { prisma } from '../prisma.js';

/**
 * Merge a branch's per-branch overrides over the global Setting singleton.
 * Empty-string overrides mean "inherit the global value". Returns a Setting-shaped
 * object so existing consumers (PromptPay, printing, receipts) work unchanged.
 */
export async function resolvedSettings(branchId?: number | null) {
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
  if (branchId == null) return setting;
  const b = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!b) return setting;
  const pick = (override: string, base: any) => (override && override.length ? override : base);
  return {
    ...setting,
    promptPayId: pick(b.promptPayId, setting.promptPayId),
    promptPayType: pick(b.promptPayType, setting.promptPayType),
    printerType: pick(b.printerType, setting.printerType),
    printerAddress: pick(b.printerAddress, setting.printerAddress),
    printerPaper: pick(b.printerPaper, setting.printerPaper),
    vfdAddress: pick(b.vfdAddress, setting.vfdAddress),
    receiptHeader: pick(b.receiptHeader, setting.receiptHeader),
    receiptFooter: pick(b.receiptFooter, setting.receiptFooter),
  };
}
