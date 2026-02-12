-- AlterTable
ALTER TABLE "Entitlement" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "revokedReason" TEXT;

-- CreateTable
CREATE TABLE "NoteAccessBan" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NoteAccessBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteAccessBan_userId_idx" ON "NoteAccessBan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteAccessBan_noteId_userId_key" ON "NoteAccessBan"("noteId", "userId");

-- AddForeignKey
ALTER TABLE "NoteAccessBan" ADD CONSTRAINT "NoteAccessBan_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAccessBan" ADD CONSTRAINT "NoteAccessBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
