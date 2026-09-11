"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function markMessageRead(id: string) {
  await prisma.contactMessage.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/admin/messages");
}

export async function deleteMessage(id: string) {
  await prisma.contactMessage.delete({ where: { id } });
  revalidatePath("/admin/messages");
}
