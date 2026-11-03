import {
  JavaClassMeta,
  toSnakeCase,
  toCamelCase,
} from '../spring_boot/template-models';
import { renderMustache } from '../mustache-renderer';

const FLUTTER_DATASOURCE_MUSTACHE = `import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../models/{{snake}}_model.dart';
import '../models/{{snake}}_request_model.dart';

abstract class {{className}}RemoteDataSource {
  Future<List<{{className}}Model>> getAll();
  Future<{{className}}Model> getById(String id);
  Future<{{className}}Model> create({{className}}RequestModel request);
  Future<{{className}}Model> update(String id, {{className}}RequestModel request);
  Future<void> delete(String id);
}

class {{className}}RemoteDataSourceImpl implements {{className}}RemoteDataSource {
  final ApiClient apiClient;

  const {{className}}RemoteDataSourceImpl({required this.apiClient});

  @override
  Future<List<{{className}}Model>> getAll() async {
    final response = await apiClient.get(ApiConstants.{{endpointName}});
    if (response.data is List) {
      return (response.data as List)
          .map((item) => {{className}}Model.fromJson(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  @override
  Future<{{className}}Model> getById(String id) async {
    final response = await apiClient.get('\${ApiConstants.{{endpointName}}}/$id');
    return {{className}}Model.fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Future<{{className}}Model> create({{className}}RequestModel request) async {
    final response = await apiClient.post(
      ApiConstants.{{endpointName}},
      data: request.toJson(),
    );
    return {{className}}Model.fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Future<{{className}}Model> update(String id, {{className}}RequestModel request) async {
    final response = await apiClient.put(
      '\${ApiConstants.{{endpointName}}}/$id',
      data: request.toJson(),
    );
    return {{className}}Model.fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Future<void> delete(String id) async {
    await apiClient.delete('\${ApiConstants.{{endpointName}}}/$id');
  }
}
`;

export function renderFlutterRemoteDataSource(meta: JavaClassMeta): string {
  const snake = toSnakeCase(meta.className);
  const endpointName = `${toCamelCase(meta.className)}Endpoint`;

  return renderMustache(FLUTTER_DATASOURCE_MUSTACHE, {
    className: meta.className,
    snake,
    endpointName,
  });
}
