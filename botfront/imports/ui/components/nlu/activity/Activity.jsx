import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Message, Segment, Label } from 'semantic-ui-react';
import IntentViewer from '../models/IntentViewer';
import NLUExampleText from '../../example_editor/NLUExampleText';
import { useActivity, useDeleteActivity, useUpsertActivity } from './hooks';

import { populateActivity } from './ActivityInsertions';
import { getSmartTips } from '../../../../lib/smart_tips';
import Filters from '../models/Filters';

import DataTable from '../../common/DataTable';
import ActivityActions from './ActivityActions';
import ActivityActionsColumn from './ActivityActionsColumn';

import PrefixDropdown from '../../common/PrefixDropdown';

function Activity(props) {
    const [sortType, setSortType] = useState('Newest');
    const getSortFunction = () => {
        switch (sortType) {
        case 'Newest':
            return { sortKey: 'createdAt', sortDesc: true };
        case 'Oldest':
            return { sortKey: 'createdAt', sortDesc: false };
        case '% ascending':
            return { sortKey: 'confidence', sortDesc: false };
        case '% decending':
            return { sortKey: 'confidence', sortDesc: true };
        default:
            throw new Error('No such sort type');
        }
    };

    const {
        model,
        model: { _id: modelId, language: lang },
        workingEnvironment,
        instance,
        entities,
        intents,
        project,
        projectId,
        linkRender,
    } = props;


    const [reinterpreting, setReinterpreting] = useState([]);
    const [filter, setFilter] = useState({ entities: [], intents: [], query: '' });

    const {
        data, hasNextPage, loading, loadMore, refetch,
    } = useActivity({
        modelId,
        environment: workingEnvironment,
        filter,
        ...getSortFunction(),
    });
    
    // always refetch on first page load and sortType change
    useEffect(() => { if (refetch) refetch(); }, [refetch, modelId, workingEnvironment, sortType, filter]);

    const [upsertActivity] = useUpsertActivity({
        modelId, environment: workingEnvironment, filter, ...getSortFunction(),
    });
    const [deleteActivity] = useDeleteActivity({
        modelId, environment: workingEnvironment, filter, ...getSortFunction(),
    });

    const isUtteranceOutdated = u => getSmartTips(model, project, u).code === 'outdated';
    const isUtteranceReinterpreting = ({ _id }) => reinterpreting.includes(_id);

    const validated = data.filter(a => a.validated);

    const handleAddToTraining = async (utterances) => {
        await Meteor.call('nlu.insertExamples', modelId, utterances);
        await deleteActivity({ variables: { modelId, ids: utterances.map(u => u._id) } });
    };

    const handleUpdate = async (newData, rest) => {
        // rest argument is to supress warnings caused by incomplete schema on optimistic response
        upsertActivity({
            variables: { modelId, data: newData },
            optimisticResponse: {
                __typename: 'Mutation',
                upsertActivity: newData.map(d => ({ __typename: 'Activity', ...rest, ...d })),
            },
        });
    };

    const handleDelete = async (ids) => {
        await deleteActivity({
            variables: { modelId, ids },
            optimisticResponse: {
                __typename: 'Mutation',
                deleteActivity: ids.map(_id => ({ __typename: 'Activity', _id })),
            },
        });
    };

    const handleReinterpret = async (utterances) => {
        setReinterpreting(Array.from(new Set([...reinterpreting, ...utterances.map(u => u._id)])));
        const reset = () => setReinterpreting(reinterpreting.filter(uid => !utterances.map(u => u._id).includes(uid)));
        try {
            populateActivity(instance, utterances.map(u => ({ text: u.text, lang })), modelId, reset);
        } catch (e) { reset(); }
    };

    const handleChangeInVisibleItems = (visibleData) => {
        if (project.training.status === 'training') return;
        if (reinterpreting.length > 49) return;
        const reinterpretable = visibleData
            .filter(isUtteranceOutdated)
            .filter(u => !isUtteranceReinterpreting(u));
        if (reinterpretable.length) handleReinterpret(reinterpretable);
    };

    const renderConfidence = (row) => {
        const { datum } = row;
        if (
            isUtteranceOutdated(datum)
            || typeof datum.intent !== 'string'
            || typeof datum.confidence !== 'number'
            || datum.confidence <= 0
        ) return null;
        return (
            <div className='confidence-text'>
                {`${Math.floor(datum.confidence * 100)}%`}
            </div>
        );
    };

    const renderIntent = (row) => {
        const { datum } = row;
        if (isUtteranceOutdated(datum)) {
            return (
                <Label color='grey' basic data-cy='intent-label'>
                    {datum.intent || '-'}
                </Label>
            );
        }
        return (
            <IntentViewer
                intents={intents.map(i => ({ value: i, text: i }))}
                example={datum}
                intent={datum.intent || ''}
                projectId={projectId}
                enableReset
                onSave={({ _id, intent, ...rest }) => handleUpdate([{ _id, intent, confidence: null }], rest)}
            />
        );
    };

    const renderExample = (row) => {
        const { datum } = row;
        return (
            <NLUExampleText
                example={datum}
                entities={entities}
                showLabels
                onSave={({ _id, entities: ents, ...rest }) => handleUpdate([{
                    _id,
                    entities: ents.map((e) => { delete e.__typename; e.confidence = null; return e; }),
                }], rest)}
                editable={!isUtteranceOutdated(datum)}
                disablePopup={isUtteranceOutdated(datum)}
                projectId={projectId}
            />
        );
    };

    const renderActions = row => (
        <ActivityActionsColumn
            datum={row.datum}
            data={data}
            isUtteranceReinterpreting={isUtteranceReinterpreting}
            onToggleValidation={({ _id, validated: val, ...rest }) => handleUpdate([{ _id, validated: !val }], rest)}
            getSmartTips={u => getSmartTips(model, project, u)}
            onMarkOoS={({ _id, ooS, ...rest }) => handleUpdate([{ _id, ooS: !ooS }], rest)}
            onDelete={utterances => handleDelete(utterances.map(u => u._id))}
        />
    );

    const columns = [
        {
            header: '%', key: 'confidence', style: { width: '40px' }, render: renderConfidence,
        },
        {
            header: 'Intent', key: 'intent', style: { width: '200px' }, render: renderIntent,
        },
        {
            header: 'Example', key: 'text', style: { width: '100%' }, render: renderExample,
        },
        {
            header: 'Actions', key: 'actions', style: { width: '110px' }, render: renderActions,
        },
    ];

    const renderTopBar = () => (
        <>
            <Segment.Group className='new-utterances-topbar' horizontal>
                <Segment className='new-utterances-topbar-section' tertiary compact floated='left'>
                    <Filters
                        intents={intents}
                        entities={entities}
                        filter={filter}
                        onChange={f => setFilter(f)}
                    />
                    <div style={{ height: '5px' }} />
                    <ActivityActions
                        onEvaluate={linkRender}
                        onDelete={() => handleDelete(validated.map(u => u._id))}
                        onAddToTraining={() => handleAddToTraining(validated)}
                        onInvalidate={() => handleUpdate(validated.map(({ _id, validated: v }) => ({ _id, validated: !v })))}
                        numValidated={validated.length}
                        projectId={projectId}
                    />
                </Segment>
                <Segment className='new-utterances-topbar-section' tertiary compact floated='right'>
                    <PrefixDropdown
                        selection={sortType}
                        updateSelection={option => setSortType(option.value)}
                        options={[
                            { value: 'Newest', text: 'Newest' },
                            { value: 'Oldest', text: 'Oldest' },
                            { value: '% ascending', text: '% ascending' },
                            { value: '% decending', text: '% decending' },
                        ]}
                        prefix='Sort by'
                    />
                </Segment>
            </Segment.Group>
            <br />
        </>
    );

    return (
        <>
            {renderTopBar()}
            {data && data.length
                ? (
                    <DataTable
                        columns={columns}
                        data={data}
                        hasNextPage={hasNextPage}
                        loadMore={loading ? () => {} : loadMore}
                        onChangeInVisibleItems={handleChangeInVisibleItems}
                    />
                )
                : <Message success icon='check' header='No activity' content='No activity was found for the given criteria.' />
            }
        </>
    );
}

Activity.propTypes = {
    projectId: PropTypes.string.isRequired,
    workingEnvironment: PropTypes.string.isRequired,
    model: PropTypes.object.isRequired,
    instance: PropTypes.object.isRequired,
    project: PropTypes.object.isRequired,
    entities: PropTypes.array.isRequired,
    intents: PropTypes.array.isRequired,
    linkRender: PropTypes.func.isRequired,
};

Activity.defaultProps = {
};

const mapStateToProps = state => ({
    projectId: state.settings.get('projectId'),
    workingEnvironment: state.settings.get('workingDeploymentEnvironment'),
});

export default connect(mapStateToProps)(Activity);
