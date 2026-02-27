-- AlterTable
ALTER TABLE "User"
ADD COLUMN "activeStudentSessionId" TEXT;

-- CreateIndex
CREATE INDEX "User_activeStudentSessionId_idx" ON "User"("activeStudentSessionId");
