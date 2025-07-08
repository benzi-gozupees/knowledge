import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Knowledge } from './knowledge.entity';
import { ScrapperService } from './scrapper.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    private readonly scrapperService: ScrapperService,
  ) {}

  async scrapeAndSave(url: string, userId: string): Promise<Knowledge> {
    const scrapedData = await this.scrapperService.scrapeWebsite(url);
    let knowledge = await this.knowledgeRepository.findOne({ where: { source: scrapedData.source } });
    if (knowledge) {
      knowledge.title = scrapedData.title;
      knowledge.content = scrapedData.content;
      knowledge.favicon = scrapedData.favicon ?? '';
      knowledge.createdBy = userId;
      knowledge.orgId = 'external';
    } else {
      knowledge = this.knowledgeRepository.create({
        title: scrapedData.title,
        content: scrapedData.content,
        source: scrapedData.source,
        favicon: scrapedData.favicon,
        createdBy: userId,
        orgId: 'external',
      } as Partial<Knowledge>);
    }
    return await this.knowledgeRepository.save(knowledge);
  }
  async getKnowledgeByUserId(userId: string) {
    return this.knowledgeRepository.find({
      where: { createdBy: userId },
    });
  }
  
  getAllKnowledge(): Promise<Knowledge[]> {
    return this.knowledgeRepository.find();
  }

  async updateKnowledge(id: string, userId: string, updates: Partial<Knowledge>): Promise<Knowledge> {
    const knowledge = await this.knowledgeRepository.findOne({ where: { id } });
  
    if (!knowledge) throw new NotFoundException('Knowledge not found');
    if (knowledge.createdBy !== userId) throw new ForbiddenException('You can only edit your own knowledge');
  
    Object.assign(knowledge, updates);
  
    return this.knowledgeRepository.save(knowledge);
  }
  
  async deleteKnowledge(id: string, userId: string): Promise<{ message: string }> {
    const knowledge = await this.knowledgeRepository.findOne({ where: { id } });
  
    if (!knowledge) throw new NotFoundException('Knowledge not found');
    if (knowledge.createdBy !== userId) throw new ForbiddenException('You can only delete your own knowledge');
  
    await this.knowledgeRepository.remove(knowledge);
    return { message: 'Knowledge deleted successfully' };
  }
}
