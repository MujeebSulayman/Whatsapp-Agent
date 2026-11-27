import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { Auth, AuthGuard, requireOwner, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { AppendRuleBody, ApplyBody, CorrectionBody, ImportBody, ImproveBody, InterviewBody, PlaybookDraftBody, PreviewBody } from './schemas.js';
import { SetupAiService } from './setup-ai.service.js';

/** AI help for setting a business up. Owner-only; nothing is saved until the owner approves it via /apply. */
@Controller('setup-ai')
@UseGuards(AuthGuard)
export class SetupAiController {
  constructor(@Inject(SetupAiService) private readonly ai: SetupAiService) {}

  @Get('status')
  status() {
    return { available: this.ai.available() };
  }

  /** Read a pasted price list or photos and PROPOSE products, areas and FAQs. Saves nothing. */
  @Post('import')
  @HttpCode(200)
  importFrom(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return this.ai.importFrom(a.businessId, parse(ImportBody, body));
  }

  /** Turn the owner's answers into draft FAQs, rules and policies. Saves nothing. */
  @Post('interview')
  @HttpCode(200)
  interview(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return this.ai.draftFromInterview(a.businessId, parse(InterviewBody, body).answers);
  }

  /** Turn a plain description of how the owner handles a kind of customer into a draft playbook. Saves nothing. */
  @Post('playbook')
  @HttpCode(200)
  playbook(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return this.ai.draftPlaybook(a.businessId, parse(PlaybookDraftBody, body).description);
  }

  @Post('improve')
  @HttpCode(200)
  async improve(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    const b = parse(ImproveBody, body);
    return { suggestion: await this.ai.improve(a.businessId, b.field, b.text, b.context) };
  }

  /** Practice chat: the real assistant answers as it would a customer, and nothing is kept. */
  @Post('preview')
  @HttpCode(200)
  preview(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return this.ai.preview(a.businessId, parse(PreviewBody, body).messages);
  }

  /** "This answer was wrong": proposes one standing rule. The owner confirms it with /rules/append. */
  @Post('correction')
  @HttpCode(200)
  async correction(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return { rule: await this.ai.ruleFromCorrection(a.businessId, parse(CorrectionBody, body)) };
  }

  @Post('rules/append')
  @HttpCode(200)
  appendRule(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return this.ai.appendRule(a.businessId, a.userId, parse(AppendRuleBody, body).rule);
  }

  /** Save the proposal the owner reviewed (and possibly edited). Everything is validated again here. */
  @Post('apply')
  @HttpCode(200)
  apply(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    return this.ai.apply(a.businessId, a.userId, parse(ApplyBody, body));
  }
}
