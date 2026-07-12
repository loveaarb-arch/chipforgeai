import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getGetProjectQueryKey,
  getListProjectChatMessagesQueryKey,
  useListProjectChatMessages,
  useSendProjectChatMessage,
  type ChatMessage,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const colors = useColors();
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.bubbleRow,
        { justifyContent: isUser ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: message.blocked
              ? colors.warning
              : isUser
                ? colors.primary
                : colors.card,
            borderColor: colors.border,
            borderWidth: isUser || message.blocked ? 0 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: message.blocked
              ? colors.warningForeground
              : isUser
                ? colors.primaryForeground
                : colors.foreground,
            fontSize: 14,
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export function ChatPanel({ projectId }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');

  const { data: messages } = useListProjectChatMessages(projectId);
  const sendMessage = useSendProjectChatMessage();

  const messagesQueryKey = getListProjectChatMessagesQueryKey(projectId);

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;
    setInput('');

    // The AI reply can take tens of seconds to generate, and the server
    // only responds once both the user message and the reply are ready.
    // Without this, the user's own message wouldn't appear at all until
    // that whole round trip finished, making the app look stuck/laggy —
    // show it immediately so there's instant feedback while the reply loads.
    const optimisticMessage: ChatMessage = {
      id: -Date.now(),
      role: 'user',
      content,
      blocked: false,
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, (previous) => [
      ...(previous ?? []),
      optimisticMessage,
    ]);

    sendMessage.mutate(
      { id: projectId, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: messagesQueryKey });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        },
        onError: () => {
          // Roll back the optimistic message so a failed send doesn't leave
          // a message stuck in the list.
          queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, (previous) =>
            (previous ?? []).filter((m) => m.id !== optimisticMessage.id),
          );
          setInput(content);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={30} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Describe the chip you want and the AI will draft an architecture.
              {'\n\n'}Try: "Design a 4-bit synchronous up-counter with an
              active-high reset."
            </Text>
          </View>
        }
        ListFooterComponent={
          sendMessage.isPending ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <View
                style={[
                  styles.bubble,
                  styles.thinkingBubble,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <ActivityIndicator size="small" color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
                  Thinking…
                </Text>
              </View>
            </View>
          ) : null
        }
      />

      <View
        style={[
          styles.inputRow,
          { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Describe your chip or request a change…"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.input,
              color: colors.foreground,
              borderColor: colors.border,
            },
          ]}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
          style={[
            styles.sendButton,
            {
              backgroundColor: colors.primary,
              opacity: !input.trim() || sendMessage.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Feather name="arrow-up" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubble: { maxWidth: '82%', borderRadius: 14, padding: 12 },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyText: { textAlign: 'center', marginTop: 12, fontSize: 13, lineHeight: 19 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
