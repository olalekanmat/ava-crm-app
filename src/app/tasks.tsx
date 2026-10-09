import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { openTodos, type TodoItem } from '@/data/alerts';
import { addDays, formatDate, toDateKey } from '@/data/dates';
import { newId } from '@/data/ids';
import { useMe, useStore } from '@/data/store';
import type { Task } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SearchBox, SectionTitle, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { remindersSupported } from '@/ui/reminders';
import { Screen } from '@/ui/Screen';
import { colors, radius, space, tone } from '@/ui/theme';

/** Open tasks and call follow-ups, with phone reminders; add a task (for yourself or, as a manager, your team). */
export default function TasksScreen() {
  const params = useLocalSearchParams<{ accountId?: string }>();
  const me = useMe();
  const { data, calls, accounts, getAccount, getUser, run } = useStore();
  const tasks = useMemo(() => data.tasks ?? [], [data.tasks]);
  const todos = useMemo(() => openTodos(tasks, calls, me.id, new Date(), 3650, (id) => getAccount(id)?.name ?? 'Account'), [tasks, calls, me.id, getAccount]);
  const done = tasks.filter((t) => t.ownerId === me.id && t.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 10);
  const team = repsUnder(data.users, me).filter((u) => u.active && u.id !== me.id);
  const setForTeam = tasks.filter((t) => t.assignedBy === me.id && t.ownerId !== me.id && !t.doneAt).sort((a, b) => a.due.localeCompare(b.due));

  const [title, setTitle] = useState('');
  const [due, setDue] = useState(toDateKey(addDays(new Date(), 1)));
  const [remind, setRemind] = useState(true);
  const [remindAt, setRemindAt] = useState('09:00');
  const [accountId, setAccountId] = useState(params.accountId);
  const [accountQuery, setAccountQuery] = useState('');
  const [ownerId, setOwnerId] = useState(me.id);

  const matches = accountQuery.trim() ? accounts.filter((a) => a.name.toLowerCase().includes(accountQuery.trim().toLowerCase()) && (a.ownerId === ownerId || ownerId === me.id)).slice(0, 5) : [];

  const attempt = (f: () => void) => {
    try {
      f();
      return true;
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const add = () => {
    const task: Task = { id: newId('tsk'), ownerId, title, due, remindAt: remind ? remindAt : undefined, accountId, createdAt: new Date().toISOString() };
    if (attempt(() => run({ type: 'task.save', task }))) {
      setTitle('');
      setAccountId(undefined);
      setAccountQuery('');
    }
  };

  const tick = (item: TodoItem) => {
    if (item.task) attempt(() => run({ type: 'task.done', id: item.task!.id, done: true }));
    else if (item.call) router.push({ pathname: '/call/edit', params: { accountId: item.call.accountId } });
  };

  const today = toDateKey(new Date());
  const groups: { title: string; items: TodoItem[] }[] = [
    { title: 'Overdue', items: todos.overdue },
    { title: 'Today', items: todos.current.filter((i) => i.due === today) },
    { title: 'Coming up', items: todos.current.filter((i) => i.due > today) },
  ];

  return (
    <Screen>
      {groups.map((g) =>
        g.items.length ? (
          <View key={g.title}>
            <SectionTitle>
              {g.title} ({g.items.length})
            </SectionTitle>
            <Card style={{ padding: 0 }}>
              {g.items.map((i) => (
                <TodoRow key={i.id} item={i} onTick={() => tick(i)} assignedBy={i.task?.assignedBy ? getUser(i.task.assignedBy)?.name : undefined} />
              ))}
            </Card>
          </View>
        ) : null,
      )}
      {!todos.overdue.length && !todos.current.length && <Empty icon="checkbox-outline" title="All done">No open tasks or follow-ups.</Empty>}

      <SectionTitle>Add a task</SectionTitle>
      <Card>
        {team.length > 0 && (
          <>
            <Label>For</Label>
            <View style={styles.wrap}>
              <Chip label="Me" selected={ownerId === me.id} onPress={() => setOwnerId(me.id)} />
              {team.map((u) => (
                <Chip key={u.id} label={u.name} selected={ownerId === u.id} onPress={() => setOwnerId(u.id)} />
              ))}
            </View>
          </>
        )}
        <Field label="Task" value={title} onChangeText={setTitle} placeholder="e.g. Send the study reprint to Dr Okafor" />
        {accountId ? (
          <Row style={{ marginBottom: space.md }}>
            <Ionicons name="business-outline" size={16} color={colors.muted} />
            <Text style={[text.body, { flex: 1 }]}>{getAccount(accountId)?.name}</Text>
            <Text style={text.link} onPress={() => setAccountId(undefined)}>
              Remove
            </Text>
          </Row>
        ) : (
          <>
            <SearchBox value={accountQuery} onChangeText={setAccountQuery} placeholder="Link an account (optional)" />
            {matches.map((a) => (
              <Chip key={a.id} label={a.name} onPress={() => { setAccountId(a.id); setAccountQuery(''); }} />
            ))}
          </>
        )}
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Due" value={due} onChangeText={setDue} placeholder="YYYY-MM-DD" />
          </View>
          {remind && (
            <View style={{ flex: 1 }}>
              <Field label="Remind at" value={remindAt} onChangeText={setRemindAt} placeholder="HH:MM" />
            </View>
          )}
        </Row>
        <View style={[styles.wrap, { marginTop: -space.sm }]}>
          <Chip label="Today" onPress={() => setDue(today)} />
          <Chip label="Tomorrow" onPress={() => setDue(toDateKey(addDays(new Date(), 1)))} />
          <Chip label="Next week" onPress={() => setDue(toDateKey(addDays(new Date(), 7)))} />
        </View>
        <ToggleRow label="Remind me" value={remind} onChange={setRemind} hint={remindersSupported ? 'A notification on the phone of the person the task is for, at that time on the due day.' : 'Reminders pop up on phones running the Ava CRM app.'} />
        <Button title="Add task" icon="add-circle-outline" onPress={add} disabled={!title.trim()} />
      </Card>

      {setForTeam.length > 0 && (
        <>
          <SectionTitle>Set for your team</SectionTitle>
          <Card style={{ padding: 0 }}>
            {setForTeam.map((t) => (
              <View key={t.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>{t.title}</Text>
                  <Text style={text.muted}>
                    {getUser(t.ownerId)?.name} · due {formatDate(t.due)}
                  </Text>
                </View>
                <Text style={[text.link, { color: colors.danger }]} onPress={() => attempt(() => run({ type: 'task.delete', id: t.id }))}>
                  Remove
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionTitle>Recently done</SectionTitle>
          <Card style={{ padding: 0 }}>
            {done.map((t) => (
              <View key={t.id} style={styles.row}>
                <Ionicons name="checkmark-circle" size={22} color={tone.good} />
                <Text style={[text.body, { flex: 1, color: colors.muted, textDecorationLine: 'line-through' }]}>{t.title}</Text>
                <Text style={text.link} onPress={() => attempt(() => run({ type: 'task.done', id: t.id, done: false }))}>
                  Undo
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
      {!remindersSupported && <Banner tone="info">Reminders are sent to phones. On the web, due tasks show here and on your home page.</Banner>}
    </Screen>
  );
}

function TodoRow({ item, onTick, assignedBy }: { item: TodoItem; onTick: () => void; assignedBy?: string }) {
  const { getAccount } = useStore();
  const account = item.accountId ? getAccount(item.accountId) : undefined;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={item.task ? 'Mark done' : 'Log the follow-up call'} onPress={onTick} style={styles.tick} hitSlop={8}>
        <Ionicons name={item.task ? 'ellipse-outline' : 'call-outline'} size={item.task ? 24 : 18} color={item.overdue ? tone.urgent : colors.primary} />
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={() => account && router.push({ pathname: '/account/[id]', params: { id: account.id } })}>
        <Text style={text.title}>{item.title}</Text>
        <Text style={[text.muted, item.overdue && { color: tone.urgent }]}>
          {item.overdue ? 'Overdue · ' : ''}
          {formatDate(item.due)}
          {item.task?.remindAt ? ` · reminder ${item.task.remindAt}` : ''}
          {item.call ? ' · from a call' : ''}
          {assignedBy ? ` · from ${assignedBy}` : ''}
          {account && item.task ? ` · ${account.name}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  tick: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
