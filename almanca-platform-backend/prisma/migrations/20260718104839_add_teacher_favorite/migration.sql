-- CreateTable
CREATE TABLE "TeacherFavorite" (
    "id" TEXT NOT NULL,
    "childProfileId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherFavorite_childProfileId_idx" ON "TeacherFavorite"("childProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherFavorite_childProfileId_teacherId_key" ON "TeacherFavorite"("childProfileId", "teacherId");

-- AddForeignKey
ALTER TABLE "TeacherFavorite" ADD CONSTRAINT "TeacherFavorite_childProfileId_fkey" FOREIGN KEY ("childProfileId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherFavorite" ADD CONSTRAINT "TeacherFavorite_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
