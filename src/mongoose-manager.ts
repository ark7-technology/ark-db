import * as mongoose from 'mongoose';
import _ from 'underscore';
import debug from 'debug';
import { A7Model, Ark7ModelMetadata, ModelClass, runtime } from '@ark7/model';
import { MongoError } from 'mongodb';

const d = debug('ark7:model-mongoose:mongoose-manager');

export class MongooseManager {
  private mongooseOptionsMap: Map<string, MongooseOptions> = new Map();

  constructor(private mongoose?: mongoose.Mongoose) {
    this.mongoose = this.mongoose ?? mongoose;
  }

  register<T>(
    cls: string | ModelClass<T>,
  ): mongoose.Model<mongoose.Document & T> {
    const mongooseOptions = this.getMongooseOptions(cls);

    return mongoose.model(
      mongooseOptions.name,
      mongooseOptions.mongooseSchema,
    ) as any;
  }

  getMongooseOptions(model: string | ModelClass<any>): MongooseOptions {
    const name = _.isString(model) ? model : model.name;

    if (this.mongooseOptionsMap.has(name)) {
      return this.mongooseOptionsMap.get(name);
    }

    const metadata = A7Model.getMetadata(model);

    const mongooseOptions = new MongooseOptions(
      metadata.name,
    ).createMongooseSchema();

    this.mongooseOptionsMap.set(name, mongooseOptions);

    return mongooseOptions.updateMetadata(metadata, this);
  }

  mapPropertyType(type: runtime.Type): any {
    switch (type) {
      case 'string':
        return String;
    }

    if (runtime.isReferenceType(type)) {
      const referenceMongooseOptions = this.getMongooseOptions(
        type.referenceName,
      );

      return referenceMongooseOptions.mongooseSchema;
    }

    if (runtime.isArrayType(type)) {
      const mType = this.mapPropertyType(type.arrayElementType);

      return [
        {
          type: mType,
          default: [],
        },
      ];
    }
  }
}

export const mongooseManager = new MongooseManager();

/**
 * Mongoose options for current model.
 */
export class MongooseOptions {
  config: mongoose.SchemaOptions = {};
  schema: {
    [key: string]: any;
  } = {};
  mongooseSchema?: mongoose.Schema;
  pres: Pre[] = [];
  posts: Post[] = [];
  virtuals: Virtual[] = [];
  methods: Method[] = [];
  statics: Method[] = [];
  plugins: Plugin[] = [];
  indexes: MongooseIndex[] = [];
  updateValidators: UpdateValidator[] = [];

  constructor(public name: string) {}

  clone(): MongooseOptions {
    const ret = new MongooseOptions(this.name);
    ret.config = this.config;
    ret.schema = this.schema;
    ret.mongooseSchema = this.mongooseSchema;
    ret.pres = this.pres;
    ret.posts = this.posts;
    ret.virtuals = this.virtuals;
    ret.methods = this.methods;
    ret.statics = this.statics;
    ret.plugins = this.plugins;
    ret.indexes = this.indexes;
    ret.updateValidators = this.updateValidators;

    return ret;
  }

  createMongooseSchema(mongooseSchema?: mongoose.Schema): this {
    this.mongooseSchema =
      this.mongooseSchema ?? mongooseSchema ?? new mongoose.Schema();

    return this;
  }

  updateMetadata(metadata: Ark7ModelMetadata, manager: MongooseManager): this {
    const currentOptions = MongooseOptions.createFromCurrentMetadata(
      metadata,
      manager,
    );

    this.updateMongooseOptions(currentOptions);

    return this.updateMongooseSchema();
  }

  protected updateMongooseOptions(options: MongooseOptions): this {
    _.defaults(this.config, options.config);
    _.defaults(this.schema, options.schema);
    this.pres = _.union([...this.pres, ...options.pres]);
    this.posts = _.union([...this.posts, ...options.posts]);
    this.virtuals = _.union([...this.virtuals, ...options.virtuals]);
    this.methods = _.union([...this.methods, ...options.methods]);
    this.statics = _.union([...this.statics, ...options.statics]);
    this.plugins = _.union([...this.plugins, ...options.plugins]);
    this.indexes = _.union([...this.indexes, ...options.indexes]);
    this.updateValidators = _.union([
      ...this.updateValidators,
      ...options.updateValidators,
    ]);

    return this;
  }

  protected updateMongooseSchema(): this {
    this.mongooseSchema.add(this.schema);

    for (const virtual of this.virtuals) {
      d(
        'create virtual for %O with name %O and options %O',
        this.name,
        virtual.name,
        virtual.options,
      );
      let v = this.mongooseSchema.virtual(virtual.name, virtual.options);
      if (virtual.get) {
        v = v.get(virtual.get);
      }
      if (virtual.set) {
        v = v.set(virtual.set);
      }
    }

    for (const method of this.methods) {
      d(
        'create method for %O with name %O and function %O',
        this.name,
        method.name,
        method.fn,
      );
      this.mongooseSchema.methods[method.name] = method.fn;
    }

    for (const method of this.statics) {
      d(
        'create static function for %O with name %O and function %O',
        this.name,
        method.name,
        method.fn,
      );
      this.mongooseSchema.statics[method.name] = method.fn;
    }

    return this;
  }

  protected static createFromCurrentMetadata(
    metadata: Ark7ModelMetadata,
    manager: MongooseManager,
  ): MongooseOptions {
    const options = new MongooseOptions(metadata.name);

    _.each(metadata.fields, (field) => {
      options.schema[field.propertyName] = field.options;
    });

    _.each(
      Object.getOwnPropertyDescriptors(metadata.modelClass),
      (desc, key) => {
        if (['name', 'prototype', 'length'].indexOf(key) >= 0) {
          return;
        }

        options.statics.push({
          name: key,
          fn: desc.value,
        });
      },
    );

    _.each(metadata.configs.schema.props, (prop) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        metadata.modelClass.prototype,
        prop.name,
      );

      if (descriptor == null) {
        if (prop.modifier === runtime.Modifier.PUBLIC && !prop.readonly) {
          options.schema[prop.name] = _.defaults(
            {},
            options.schema[prop.name],
            {
              type: manager.mapPropertyType(prop.type),
              required: !prop.optional,
            },
          );
        }
      } else {
        if (descriptor.value && _.isFunction(descriptor.value)) {
          options.methods.push({ name: prop.name, fn: descriptor.value });
        }

        if (descriptor.get || descriptor.set) {
          const virtual: Virtual = {
            name: prop.name,
          };
          if (descriptor.get) {
            virtual.get = descriptor.get;
          }
          if (descriptor.set) {
            virtual.set = descriptor.set;
          }
          options.virtuals.push(virtual);
        }
      }
    });

    // d('create schema for %O with %O', metadata.name, options.schema);

    return options;
  }
}

export interface Pre {
  name: string;
  fn: (next: (err?: NativeError) => void) => void;
  parallel?: boolean;
  errorCb?: (err: Error) => void;
}

export interface PPre {
  fn: (next: (err?: NativeError) => void) => void;
  parallel?: boolean;
  errorCb?: (err: Error) => void;
}

export interface Post {
  name: string;
  fn: PostFn1 | PostFn2;
}

export interface PPost {
  fn: PostFn1 | PostFn2;
}

export type PostFn1 = (doc: object, next: (err?: NativeError) => void) => void;
export type PostFn2 = (
  error: MongoError,
  doc: object,
  next: (err?: NativeError) => void,
) => void;

export interface Virtual {
  name: string;
  get?: () => any;
  set?: (val?: any) => void;
  options?: VirtualOptions;
}

export interface Method {
  name: string;
  fn: () => void;
}

export interface Plugin {
  fn: (schema: mongoose.Schema, options?: object) => void;
  options?: object;
  priority?: number;
}

export interface MongooseIndex {
  fields: object;
  options?: {
    expires?: string;
    [other: string]: any;
  };
}

export interface Validator {
  validator: (v: any) => any;
  message: string | ((props: { value: any }) => string);
}

export interface UpdateValidator {
  path: string;
  fn: (val?: any) => boolean;
  errorMsg?: string;
  type?: string;
}

export interface VirtualOptions {
  ref: string;
  localField: string;
  foreignField: string;
  justOne?: boolean;
  options?: any;
  count?: boolean;
  match?: object;
}

export class NativeError extends global.Error {}
