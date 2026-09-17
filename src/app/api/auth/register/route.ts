import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email("이메일 형식이 올바르지 않습니다."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  name: z.string().max(60).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "이미 가입된 이메일입니다." }, { status: 409 });
  }

  // 첫 사용자는 관리자로 둔다. 혼자 쓰는 설치가 대부분이라 그게 편하다.
  const isFirst = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name?.trim() || null,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: isFirst ? "admin" : "user",
    },
  });

  return NextResponse.json({ id: user.id, email: user.email });
}
