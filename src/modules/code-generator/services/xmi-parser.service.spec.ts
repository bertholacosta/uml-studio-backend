import { Test, TestingModule } from '@nestjs/testing';
import { XmiParserService } from './xmi-parser.service';

describe('XmiParserService', () => {
  let service: XmiParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XmiParserService],
    }).compile();

    service = module.get<XmiParserService>(XmiParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw BadRequestException if XML is empty or invalid', () => {
    expect(() => service.parseXmi('')).toThrow();
  });
});
