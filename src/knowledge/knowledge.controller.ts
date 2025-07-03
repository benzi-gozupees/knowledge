import { Controller, Post, Get, Body } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('scrape')
  async scrapeWebsite(@Body('url') url: string) {
    return this.knowledgeService.scrapeAndSave(url);
  }

  @Get()
  async getAll() {
    return this.knowledgeService.getAllKnowledge();
  }
}
