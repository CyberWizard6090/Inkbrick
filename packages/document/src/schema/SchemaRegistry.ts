import type { BlockRole, BlockSchema, FlavourConstraint } from './BlockSchema';
import type { InlineSchema } from './InlineSchema';
import type { BlockFlavour } from '../model/BlockFlavour';
import type { BlockProps } from '../model/BlockProps';

export class SchemaRegistry {
  private readonly blockSchemas = new Map<BlockFlavour, BlockSchema>();
  private readonly inlineSchemas = new Map<string, InlineSchema>();

  constructor(initialBlocks: readonly BlockSchema[] = []) {
    initialBlocks.forEach((s) => this.registerBlock(s));
  }

  /** Регистрирует новый тип блока. Повторная регистрация — ошибка: для намеренной замены есть `replaceBlock`. */
  public registerBlock(schema: BlockSchema): void {
    if (this.blockSchemas.has(schema.flavour)) {
      throw new Error(
        `Block "${schema.flavour}" is already registered; use replaceBlock() to override it`,
      );
    }

    this.blockSchemas.set(schema.flavour, schema);
  }

  public replaceBlock(schema: BlockSchema): void {
    if (!this.blockSchemas.has(schema.flavour)) {
      throw new Error(`Block "${schema.flavour}" is not registered; use registerBlock() to add it`);
    }

    this.blockSchemas.set(schema.flavour, schema);
  }

  public unregisterBlock(flavour: BlockFlavour): boolean {
    return this.blockSchemas.delete(flavour);
  }

  public getAllBlockSchemas(): BlockSchema[] {
    return Array.from(this.blockSchemas.values());
  }

  public registerInline(schema: InlineSchema): void {
    this.inlineSchemas.set(schema.type, schema);
  }

  public hasBlock(flavour: BlockFlavour): boolean {
    return this.blockSchemas.has(flavour);
  }

  public getBlockSchema(flavour: BlockFlavour): BlockSchema | undefined {
    return this.blockSchemas.get(flavour);
  }

  public requireBlockSchema(flavour: BlockFlavour): BlockSchema {
    const schema = this.blockSchemas.get(flavour);
    if (!schema) {
      throw new Error(`[SchemaRegistry] Не найдена схема для ${flavour}`);
    }
    return schema;
  }

  public validateRelation(parentFlavour: BlockFlavour, childFlavour: BlockFlavour): boolean {
    const parentSchema = this.blockSchemas.get(parentFlavour);
    const childSchema = this.blockSchemas.get(childFlavour);

    if (!parentSchema || !childSchema) return false;

    return (
      this.checkConstraint(parentSchema.allowedChildren, childFlavour) &&
      this.checkConstraint(childSchema.allowedParents, parentFlavour)
    );
  }

  private checkConstraint(constraint: FlavourConstraint, target: string): boolean {
    if (constraint === '*') return true;
    if (typeof constraint === 'function') return constraint(target);

    const role = this.getRole(target);

    return constraint.some((entry) => entry === target || entry === `role:${role}`);
  }

  public getRole(flavour: BlockFlavour): BlockRole {
    return this.blockSchemas.get(flavour)?.role ?? 'content';
  }

  public getVersion(flavour: BlockFlavour): number {
    return this.blockSchemas.get(flavour)?.version ?? 1;
  }

  public migrateProps(flavour: BlockFlavour, props: BlockProps, fromVersion: number): BlockProps {
    const schema = this.blockSchemas.get(flavour);

    if (!schema?.migrate || fromVersion >= this.getVersion(flavour)) return props;

    return schema.migrate(props, fromVersion);
  }

  public validateProps(flavour: BlockFlavour, props: unknown) {
    return this.requireBlockSchema(flavour).propsSchema.safeParse(props);
  }

  /** Пропсы блока по умолчанию (значения .default() из zod-схемы) с наложением overrides. */
  public createProps(flavour: BlockFlavour, overrides: BlockProps = {}): BlockProps {
    const result = this.validateProps(flavour, overrides);

    if (!result.success) {
      throw new Error(
        `[SchemaRegistry] Некорректные props для ${flavour}: ${result.error.message}`,
      );
    }

    return result.data as BlockProps;
  }
}
