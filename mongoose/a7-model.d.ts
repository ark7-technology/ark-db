import * as model from './model';
import * as timestamp from './timestamp';
import * as dataLevel from './data-level';
import * as discriminator from './discriminator';
export declare type A7ModelType = typeof A7Model & dataLevel.DataLevelModelType & timestamp.TimestampModelType & A7ModelClass & typeof discriminator.Discriminator;
export interface A7ModelClass {
    $modelClass?: any;
}
export interface A7Model extends timestamp.TimestampModel, discriminator.Discriminator {
}
export declare class A7Model extends model.DocumentModel {
}
