export type GetSelfInformationProtoResult =
	{
		login: false;
	} | {
		login: true;
		name: string;
		premium: boolean;
	};

export interface GetSelfInformationProtoParameterObject {
	callback: (errorMesage: string | null, result: GetSelfInformationProtoResult | null) => void;
}

export interface AtsumaruPlugin {
	getSelfInformationProto(param: GetSelfInformationProtoParameterObject): void;
}
