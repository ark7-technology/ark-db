import * as mongoose from 'mongoose';
import _ from 'underscore';
import {
  A7Model,
  Ark7ModelMetadata,
  Manager,
  Model,
  ModelClass,
  manager as _manager,
} from '@ark7/model';

import {
  ModifiedDocument,
  MongooseManager,
  lazyFns,
  shareFns,
} from './mongoose-manager';
import { MongooseKoa } from './mixins/koa';
import { MongoosePluginPeriod } from './plugin';

@A7Model({})
export class MongooseModel extends Model {
  static mongooseManager: MongooseManager;

  public static cast<D extends mongoose.Document>(): mongoose.Model<D> {
    return (this as any)._proxy || this;
  }

  public static getMetadata(manager: Manager = _manager): Ark7ModelMetadata {
    return manager.getMetadata(
      this.prototype instanceof mongoose.Model ? (this as any).modelName : this,
    );
  }
}

@A7Model({})
export class DiscriminateMongooseModel extends MongooseModel {
  static $discriminator<
    T,
    P extends ModelClass<T>,
    T1,
    P1 extends ModelClass<T1>,
    T2,
    P2 extends ModelClass<T2>,
    T3,
    P3 extends ModelClass<T3>,
    T4,
    P4 extends ModelClass<T4>,
    T5,
    P5 extends ModelClass<T5>,
    T6,
    P6 extends ModelClass<T6>,
    T7,
    P7 extends ModelClass<T7>,
    T8,
    P8 extends ModelClass<T8>,
    T9,
    P9 extends ModelClass<T9>
  >(
    cls: P,
    options?: mongoose.SchemaOptions,
    manager?: Manager,
    _m1?: P1,
    _m2?: P2,
    _m3?: P3,
    _m4?: P4,
    _m5?: P5,
    _m6?: P6,
    _m7?: P7,
    _m8?: P8,
    _m9?: P9,
  ): mongoose.Model<
    mongoose.Document &
      ModifiedDocument<
        InstanceType<P> &
          InstanceType<P1> &
          InstanceType<P2> &
          InstanceType<P3> &
          InstanceType<P4> &
          InstanceType<P5> &
          InstanceType<P6> &
          InstanceType<P7> &
          InstanceType<P8> &
          InstanceType<P9>
      >
  > &
    P &
    P1 &
    P2 &
    P3 &
    P4 &
    P5 &
    P6 &
    P7 &
    P8 &
    P9 &
    typeof MongooseKoa;

  static $discriminator<T, P extends ModelClass<T>>(
    cls: P,
    options: mongoose.SchemaOptions = {},
    manager: Manager = _manager,
  ): mongoose.Model<mongoose.Document & ModifiedDocument<InstanceType<P>>> &
    P &
    typeof MongooseKoa {
    const mongooseOptions = this.mongooseManager.getMongooseOptions(cls);
    mongooseOptions.updateMetadata(
      manager.getMetadata(MongooseKoa),
      this.mongooseManager,
    );

    this.mongooseManager.runPlugin(
      MongoosePluginPeriod.BEFORE_REGISTER,
      mongooseOptions,
    );

    _.each(
      _.extend({}, options, {
        toJSON: _.extend(
          {
            versionKey: false,
            flattenMaps: true,
            virtuals: true,
          },
          options.toJSON,
        ),
        toObject: _.extend(
          {
            versionKey: false,
            flattenMaps: true,
            virtuals: true,
          },
          options.toObject,
        ),
      }),
      (value, key: keyof mongoose.SchemaOptions) => {
        (mongooseOptions.mongooseSchema as mongoose.Schema).set(key, value);
      },
    );

    const current = this.cast();

    if (!this.mongooseManager.options.multiTenancy?.enabled) {
      const model = current.discriminator(
        mongooseOptions.name,
        mongooseOptions.mongooseSchema as mongoose.Schema,
      );

      model.mongooseManager = this.mongooseManager;

      return model as any;
    }

    const parentTenantMap = this.mongooseManager.getTenantMap(
      (this as any).modelName,
    );

    const tenantMap = this.mongooseManager.createTenantMap(
      mongooseOptions.name,
    );

    for (const tenancy of this.mongooseManager.tenants) {
      const m = parentTenantMap[tenancy];

      const model = m.discriminator(
        mongooseOptions.name,
        mongooseOptions.mongooseSchema as mongoose.Schema,
      );

      model.mongooseManager = this.mongooseManager;
      tenantMap[tenancy] = model;
    }

    return this.mongooseManager.createProxy(tenantMap);
  }
}
