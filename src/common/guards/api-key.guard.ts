import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['token']; // 🔐 renamed from x-api-key to token
    const validToken = this.configService.get<string>('API_KEY');

    if (!token || token !== validToken) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    return true;
  }
}
