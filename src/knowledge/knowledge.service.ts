import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Knowledge } from './knowledge.entity';
import { ScrapperService } from './scrapper.service';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    private readonly scrapperService: ScrapperService,
  ) {}

  async scrapeAndSave(url: string): Promise<Knowledge> {
    const scrapedData = await this.scrapperService.scrapeWebsite(url);

    const knowledge = this.knowledgeRepository.create({
      title: scrapedData.title,
      content: scrapedData.content,
      source: scrapedData.source,
      favicon: scrapedData.favicon,
      createdBy: 'microservice',
      orgId: 'external',
    } as Partial<Knowledge>);
    

    return await this.knowledgeRepository.save(knowledge);
  }

  getAllKnowledge(): Promise<Knowledge[]> {
    return this.knowledgeRepository.find();
  }
}
