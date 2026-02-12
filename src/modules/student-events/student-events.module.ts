import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentEventsController } from './student-events.controller';

@Module({
  imports: [AuthModule],
  controllers: [StudentEventsController],
})
export class StudentEventsModule {}
