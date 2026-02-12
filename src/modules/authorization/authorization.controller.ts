import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthorizationService } from './authorization.service';

@ApiTags('authorization')
@Controller('authorization')
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}
}
