import React from 'react';
import PropTypes from 'prop-types';
import { update as _update } from 'lodash';
import { dump as yamlDump, safeLoad as yamlLoad } from 'js-yaml';
import { StoryController } from '../../../../lib/story_controller';
import FloatingIconButton from '../../nlu/common/FloatingIconButton';
import UserUtteranceContainer from './UserUtteranceContainer';
import BotResponsesContainer from './BotResponsesContainer';
import AddStoryLine from './AddStoryLine';
import ActionLabel from '../ActionLabel';
import SlotLabel from '../SlotLabel';
import { ConversationOptionsContext } from '../../utils/Context';

class StoryVisualEditor extends React.Component {
    state = {
        lineInsertIndex: null,
    }

    addStoryCursor = React.createRef();

    componentDidUpdate(_prevProps, prevState) {
        const { lineInsertIndex } = this.state;
        if ((lineInsertIndex || lineInsertIndex === 0) && lineInsertIndex !== prevState.lineInsertIndex) {
            this.addStoryCursor.current.focus();
        }
    }

    handleDeleteLine = (i) => {
        const { story } = this.props;
        story.deleteLine(i);
    }

    updateSequence = (responses, name, lang, updater) => {
        const i = responses.map(r => r.key).indexOf(name);
        const j = responses[i].values.map(v => v.lang).indexOf(lang);
        const path = `[${i}].values[${j}].sequence`;
        const newResponses = [...responses];
        return _update(newResponses, path, updater);
    }

    handleDeleteResponse = (name, j) => {
        const { responses, lang, updateResponses } = this.context;
        const updater = sequence => ([...sequence.slice(0, j), ...sequence.slice(j + 1)]);
        const newResponses = this.updateSequence(responses, name, lang, updater);
        updateResponses(newResponses);
    };

    handleChangeUserUtterance = (i, v) => {
        const { story } = this.props;
        const updatedLine = { type: 'user', data: [v] };
        story.replaceLine(i, updatedLine);
    }

    handleCreateUserUtterance = (i, pl) => {
        this.setState({ lineInsertIndex: null });
        const { story } = this.props;
        const newLine = { type: 'user', data: [pl || null] };
        story.insertLine(i, newLine);
    }

    handleChangeActionOrSlot = (type, i, data) => {
        const { story } = this.props;
        story.replaceLine(i, { type, data });
    }

    handleCreateSlotOrAction = (i, data) => {
        this.setState({ lineInsertIndex: null });
        const { story } = this.props;
        story.insertLine(i, data);
    }

    handleCreateSequence = (i, template) => {
        this.setState({ lineInsertIndex: null });
        const { story } = this.props;
        const { responses, lang, updateResponses } = this.context;
        const key = this.findResponseName();
        const newResponse = {
            key,
            values: [{
                lang,
                sequence: [{ content: this.defaultTemplate(template) }],
            }],
        };
        updateResponses(responses.concat([newResponse]));
        const newLine = { type: 'bot', data: { name: key } };
        story.insertLine(i, newLine);
    }

    handleCreateResponse = (name, j, template) => {
        const { responses, lang, updateResponses } = this.context;
        const updater = sequence => ([...sequence.slice(0, j + 1), { content: this.defaultTemplate(template) }, ...sequence.slice(j + 1)]);
        const newResponses = this.updateSequence(responses, name, lang, updater);
        updateResponses(newResponses);
    }

    handleChangeResponse = (name, j, content) => {
        const { responses, lang, updateResponses } = this.context;
        const updater = sequence => ([...sequence.slice(0, j), { content: yamlDump(content) }, ...sequence.slice(j + 1)]);
        const newResponses = this.updateSequence(responses, name, lang, updater);
        updateResponses(newResponses);
    }

    defaultTemplate = (template) => {
        if (template === 'text') { return yamlDump({ text: '' }); }
        if (template === 'qr') { return yamlDump({ text: '', buttons: [] }); }
        return false;
    }

    parseUtterance = u => ({
        text: u,
        intent: 'dummdummIntent',
    });

    findResponseName = () => {
        const { responses } = this.context;
        const unnamedResponses = responses
            .map(r => r.key)
            .filter(r => r.indexOf('utter_new') === 0);
        return `utter_new_${unnamedResponses.length + 1}`;
    }

    renderActionLine = (i, l, deletable = true) => (
        <React.Fragment key={i + l.data.name}>
            <div className='utterance-container' agent='na'>
                <ActionLabel value={l.data.name} onChange={v => this.handleChangeActionOrSlot('action', i, { name: v })} />
                { deletable && <FloatingIconButton icon='trash' onClick={() => this.handleDeleteLine(i)} /> }
            </div>
            {this.renderAddLine(i)}
        </React.Fragment>
    );

    renderSlotLine = (i, l, deletable = true) => (
        <React.Fragment key={i + l.data.name}>
            <div className='utterance-container' agent='na'>
                <SlotLabel value={l.data} onChange={v => this.handleChangeActionOrSlot('slot', i, v)} />
                { deletable && <FloatingIconButton icon='trash' onClick={() => this.handleDeleteLine(i)} /> }
            </div>
            {this.renderAddLine(i)}
        </React.Fragment>
    );

    newLineOptions = () => ({
        userUtterance: true, botUtterance: true, action: true, slot: true,
    });

    renderAddLine = (i) => {
        const { lineInsertIndex } = this.state;
        const options = this.newLineOptions(i);

        if (!Object.keys(options).length) return null;
        if (lineInsertIndex === i) {
            return (
                <AddStoryLine
                    ref={this.addStoryCursor}
                    availableActions={options}
                    onCreateUtteranceFromInput={() => this.handleCreateUserUtterance(i)}
                    onCreateUtteranceFromPayload={pl => this.handleCreateUserUtterance(i, pl)}
                    onSelectResponse={() => {}} // not needed for now since disableExisting is on
                    onCreateResponse={template => this.handleCreateSequence(i, template)}
                    onSelectAction={action => this.handleCreateSlotOrAction(i, { type: 'action', data: { name: action } })}
                    onSelectSlot={slot => this.handleCreateSlotOrAction(i, { type: 'slot', data: slot })}
                    onBlur={({ relatedTarget }) => {
                        const modals = Array.from(document.querySelectorAll('.modal'));
                        const popups = Array.from(document.querySelectorAll('.popup'));
                        if (!(
                            this.addStoryCursor.current.contains(relatedTarget)
                            || modals.some(m => m.contains(relatedTarget))
                            || popups.some(m => m.contains(relatedTarget)) || (relatedTarget && relatedTarget.tagName === 'INPUT')
                        )) { this.setState({ lineInsertIndex: null }); }
                    }}
                />
            );
        }
        return (
            <FloatingIconButton icon='ellipsis horizontal' size='medium' onClick={() => this.setState({ lineInsertIndex: i })} />
        );
    };

    render() {
        const { story } = this.props;
        const deletable = story.lines.length > 1;
        const lines = story.lines.map((line, i) => {
            if (line.gui.type === 'action') return this.renderActionLine(i, line.gui, deletable);
            if (line.gui.type === 'slot') return this.renderSlotLine(i, line.gui, deletable);
            if (line.gui.type === 'bot') {
                return (
                    <React.Fragment key={i + line.gui.data.name}>
                        <BotResponsesContainer
                            name={line.gui.data.name}
                            deletable={deletable}
                            onDeleteAllResponses={() => this.handleDeleteLine(i)}
                            onDeleteResponse={j => this.handleDeleteResponse(line.gui.data.name, j)}
                            onCreateResponse={(j, template) => this.handleCreateResponse(line.gui.data.name, j, template)}
                            onChangeResponse={(j, content) => this.handleChangeResponse(line.gui.data.name, j, content)}
                        />
                        {this.renderAddLine(i)}
                    </React.Fragment>
                );
            }
            return (
                <React.Fragment key={i + (line.gui.data[0] ? line.gui.data[0].intent : '')}>
                    <UserUtteranceContainer
                        deletable={deletable}
                        value={line.gui.data[0]} // for now, data is a singleton
                        onChange={v => this.handleChangeUserUtterance(i, v)}
                        onInput={v => this.handleChangeUserUtterance(i, this.parseUtterance(v))}
                        onDelete={() => this.handleDeleteLine(i)}
                        onAbort={() => this.handleDeleteLine(i)}
                    />
                    {this.renderAddLine(i)}
                </React.Fragment>
            );
        });

        return (
            <div
                className='story-visual-editor'
            >
                {this.renderAddLine(-1)}
                {lines}
            </div>
        );
    }
}

StoryVisualEditor.propTypes = {
    /* story: PropTypes.arrayOf(
        PropTypes.oneOfType([
            PropTypes.shape({
                type: 'bot',
                data: PropTypes.shape({
                    name: PropTypes.string,
                }),
            }),
            PropTypes.shape({
                type: 'action',
                data: PropTypes.shape({
                    name: PropTypes.string,
                }),
            }),
            PropTypes.shape({
                type: 'slot',
                data: PropTypes.shape({
                    name: PropTypes.string,
                    value: PropTypes.string,
                }),
            }),
            PropTypes.shape({
                type: 'user',
                data: PropTypes.arrayOf(
                    PropTypes.shape({
                        intent: PropTypes.string,
                        entities: PropTypes.arrayOf(
                            PropTypes.object,
                        ),
                    }),
                ),
            }),
        ]),
    ), */
    story: PropTypes.instanceOf(StoryController),
};

StoryVisualEditor.contextType = ConversationOptionsContext;

StoryVisualEditor.defaultProps = {
    story: [],
};

export const { updateSequence } = StoryVisualEditor.prototype;
export default StoryVisualEditor;
