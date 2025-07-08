import { Controller, Post, Get, Body, UseGuards, Param,Put,Delete } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('/scrape/:userId')
  async scrapeWebsite(
    @Param('userId') userId: string,
    @Body('url') url: string
  ) {
    return this.knowledgeService.scrapeAndSave(url, userId);
  }

  @Get('/:userId')
  async getByUserId(@Param('userId') userId: string) {
    return this.knowledgeService.getKnowledgeByUserId(userId);
  }
  @Get()
  async getAll() {
    return this.knowledgeService.getAllKnowledge();
  }

  @Put('/:id/:userId')
async updateKnowledge(
  @Param('id') id: string,
  @Param('userId') userId: string,
  @Body() updates: Partial<{ title: string; content: string; favicon: string }>
) {
  return this.knowledgeService.updateKnowledge(id, userId, updates);
}

@Delete('/:id/:userId')
async deleteKnowledge(@Param('id') id: string, @Param('userId') userId: string) {
  return this.knowledgeService.deleteKnowledge(id, userId);
}
}
