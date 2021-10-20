// @Libs
import { useEffect, useMemo } from 'react';
import { Col, Row } from 'antd';
// @Services
import ApplicationServices from 'lib/services/ApplicationServices';
// @Components
import { ErrorCard } from 'lib/components/ErrorCard/ErrorCard';
import { SourceEditorFormStreamsLoadableForm } from './SourceEditorFormStreamsLoadableForm';
import { LoadableFieldsLoadingMessageCard } from 'lib/components/LoadingFormCard/LoadingFormCard';
// @Hooks
import { usePolling } from 'hooks/usePolling';
// @Utils
import { withQueryParams } from 'utils/queryParams';
import {
  assertIsArrayOfTypes,
  assertIsObject,
  assertIsString
} from 'utils/typeCheck';
// @Types
import { SourceConnector } from 'catalog/sources/types';
import {
  AddStream,
  RemoveStream,
  SetStreams,
  UpdateStream
} from './SourceEditor';

type Props = {
  initialSourceDataFromBackend: Optional<Partial<SourceData>>;
  sourceDataFromCatalog: SourceConnector;
  sourceConfigValidatedByStreamsTab: boolean;
  handleSetConfigValidatedByStreams: VoidFunction;
  addStream: AddStream;
  removeStream: RemoveStream;
  updateStream: UpdateStream;
  setStreams: SetStreams;
  handleBringSourceData: () => SourceData;
};

export const SourceEditorFormStreams: React.FC<Props> = ({
  initialSourceDataFromBackend,
  sourceDataFromCatalog,
  sourceConfigValidatedByStreamsTab,
  handleSetConfigValidatedByStreams,
  addStream,
  removeStream,
  updateStream,
  setStreams,
  handleBringSourceData
}) => {
  const previouslyCheckedStreams = useMemo<AirbyteStreamData[]>(
    () =>
      initialSourceDataFromBackend?.config?.catalog?.streams ??
      initialSourceDataFromBackend?.catalog?.streams ??
      [],
    [initialSourceDataFromBackend]
  );

  const {
    isLoading,
    data,
    error,
    reload: restartPolling
  } = usePolling<AirbyteStreamData[]>((end, fail) => async () => {
    try {
      const result = await pullAllAirbyteStreams(
        previouslyCheckedStreams,
        sourceDataFromCatalog,
        handleBringSourceData
      );
      if (result !== undefined) end(result);
    } catch (error) {
      fail(error);
    } finally {
      handleSetConfigValidatedByStreams();
    }
  });

  useEffect(() => {
    if (!sourceConfigValidatedByStreamsTab) restartPolling();
  }, [sourceConfigValidatedByStreamsTab]);

  return (
    <>
      {data && (
        <SourceEditorFormStreamsLoadableForm
          allStreams={data}
          initiallySelectedStreams={previouslyCheckedStreams}
          hide={isLoading || !!error}
          addStream={addStream}
          removeStream={removeStream}
          updateStream={updateStream}
          setStreams={setStreams}
        />
      )}
      {isLoading ? (
        <Row>
          <Col span={24}>
            <LoadableFieldsLoadingMessageCard
              title="Validating the source configuration"
              longLoadingMessage="This operation may take up to 3 minutes if you are configuring streams of this source type for the first time."
              showLongLoadingMessageAfterMs={10000}
            />
          </Col>
        </Row>
      ) : error ? (
        <Row>
          <Col span={24}>
            <ErrorCard
              title={`Source configuration validation failed`}
              description={
                error
                  ? `Connection is not configured.${
                      error.stack ? ' See more details in the error stack.' : ''
                    }`
                  : `Internal error. Please, file an issue.`
              }
              stackTrace={error?.stack}
              className={'form-fields-card'}
            />
          </Col>
        </Row>
      ) : (
        <Row>
          <Col span={24}>
            <ErrorCard
              title={`Source configuration validation failed`}
              description={`Internal error. Please, file an issue.`}
              className={'form-fields-card'}
            />
          </Col>
        </Row>
      )}
    </>
  );
};

const pullAllAirbyteStreams = async (
  previouslyCheckedStreams: AirbyteStreamData[],
  sourceDataFromCatalog: SourceConnector,
  handleBringSourceData: () => SourceData
): Promise<AirbyteStreamData[] | undefined> => {
  const services = ApplicationServices.get();

  const config = (await handleBringSourceData()).config.config;
  const baseUrl = sourceDataFromCatalog.staticStreamsConfigEndpoint;
  const project_id = services.userService.getUser().projects[0].id;

  const response = await services.backendApiClient.post(
    withQueryParams(baseUrl, { project_id }),
    config,
    { proxy: true }
  );

  if (response.message) throw new Error(response.message);

  if (response.status !== 'pending') {
    assertIsObject(
      response,
      `Airbyte streams parsing error: backend response is not an object`
    );
    assertIsObject(
      response.catalog,
      `Airbyte streams parsing error: backend response.catalog is not an object`
    );
    assertIsArrayOfTypes(
      response.catalog.streams,
      {},
      `Airbyte streams parsing error: backend response.catalog.streams is not an array of objects`
    );

    const rawAirbyteStreams: UnknownObject[] = response.catalog?.streams;

    const streams: AirbyteStreamData[] = rawAirbyteStreams.map((stream) => {
      assertIsString(stream.name, {
        errMsg: `Airbyte streams parsing error: stream.name is not a string`
      });
      assertIsString(stream.namespace, {
        allowUndefined: true,
        errMsg: `Airbyte streams parsing error: stream.namespace is not a string or undefined`
      });
      assertIsObject(
        stream.json_schema,
        `Airbyte streams parsing error: stream.json_schema is not an object`
      );
      assertIsArrayOfTypes(
        stream.supported_sync_modes,
        '',
        `Airbyte streams parsing error: stream.supported_sync_modes is not an array of strings`
      );

      const previouslyCheckedStreamData = previouslyCheckedStreams.find(
        (checkedStream) =>
          checkedStream.stream.name === stream.name &&
          checkedStream.stream.namespace === stream.namespace
      );

      if (previouslyCheckedStreamData) return previouslyCheckedStreamData;

      return {
        sync_mode: stream.supported_sync_modes[0],
        destination_sync_mode: 'overwrite',
        stream: {
          name: stream.name,
          namespace: stream.namespace,
          json_schema: stream.json_schema,
          supported_sync_modes: stream.supported_sync_modes,
          ...stream
        }
      };
    });

    return streams;
  }
};
