/**
 * Tests for the command system.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CommandContext } from "@/commands/CommandContext";
import { useAppStore } from "@/stores/appStore";
import { UpdateTopic } from "@/types";
import type { Command } from "@/commands/types";

/** Reset the store between tests. */
function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/** Create a simple test command. */
function testCommand(
  name: string,
  topics: UpdateTopic[],
  executeFn: (ctx: CommandContext) => void
): Command {
  return {
    name,
    topics,
    execute: executeFn,
  };
}

describe("CommandContext", () => {
  let ctx: CommandContext;

  beforeEach(() => {
    resetStore();
    ctx = new CommandContext();
  });

  it("starts with no undo/redo available", () => {
    expect(ctx.canUndo).toBe(false);
    expect(ctx.canRedo).toBe(false);
    expect(ctx.undoCommandName).toBeNull();
    expect(ctx.redoCommandName).toBeNull();
  });

  it("executes a command", async () => {
    let executed = false;
    const cmd = testCommand("TestCmd", [], () => {
      executed = true;
    });
    await ctx.execute(cmd);
    expect(executed).toBe(true);
  });

  it("tracks command execution in change stack", async () => {
    const cmd = testCommand("TestCmd", [], () => {});
    await ctx.execute(cmd);

    const stack = ctx.getChangeStack();
    expect(stack.length).toBe(1);
    expect(stack[0].commandName).toBe("TestCmd");
  });

  it("signals update topics to listeners", async () => {
    const receivedTopics: UpdateTopic[][] = [];
    ctx.onUpdate((topics) => receivedTopics.push(topics));

    const cmd = testCommand(
      "MutatingCmd",
      [UpdateTopic.Frame, UpdateTopic.Instance],
      () => {}
    );
    await ctx.execute(cmd);

    expect(receivedTopics.length).toBe(1);
    expect(receivedTopics[0]).toEqual([
      UpdateTopic.Frame,
      UpdateTopic.Instance,
    ]);
  });

  it("does not signal topics for non-mutating commands", async () => {
    const receivedTopics: UpdateTopic[][] = [];
    ctx.onUpdate((topics) => receivedTopics.push(topics));

    const cmd = testCommand("ReadOnly", [], () => {});
    await ctx.execute(cmd);

    expect(receivedTopics.length).toBe(0);
  });

  it("allows unregistering listeners", async () => {
    const receivedTopics: UpdateTopic[][] = [];
    const unsubscribe = ctx.onUpdate((topics) => receivedTopics.push(topics));
    unsubscribe();

    const cmd = testCommand("MutatingCmd", [UpdateTopic.Frame], () => {});
    await ctx.execute(cmd);

    expect(receivedTopics.length).toBe(0);
  });

  it("provides access to store state", () => {
    expect(ctx.state).toBe(useAppStore.getState());
  });

  describe("undo/redo", () => {
    it("enables undo after executing a mutating command", async () => {
      const cmd = testCommand("MutatingCmd", [UpdateTopic.Frame], () => {});
      await ctx.execute(cmd);

      expect(ctx.canUndo).toBe(true);
      expect(ctx.undoCommandName).toBe("MutatingCmd");
    });

    it("does not enable undo after non-mutating commands", async () => {
      const cmd = testCommand("ReadOnly", [], () => {});
      await ctx.execute(cmd);

      expect(ctx.canUndo).toBe(false);
    });

    it("undo returns false when nothing to undo", () => {
      expect(ctx.undo()).toBe(false);
    });

    it("redo returns false when nothing to redo", () => {
      expect(ctx.redo()).toBe(false);
    });

    it("clears redo stack on new mutating command", async () => {
      // Execute a command, undo it, then execute a new one
      const cmd1 = testCommand("Cmd1", [UpdateTopic.Frame], () => {});
      const cmd2 = testCommand("Cmd2", [UpdateTopic.Frame], () => {});

      await ctx.execute(cmd1);
      ctx.undo();
      expect(ctx.canRedo).toBe(true);

      await ctx.execute(cmd2);
      expect(ctx.canRedo).toBe(false);
    });
  });

  describe("command names", () => {
    it("tracks undo command name", async () => {
      const cmd = testCommand("ImportantAction", [UpdateTopic.Frame], () => {});
      await ctx.execute(cmd);

      expect(ctx.undoCommandName).toBe("ImportantAction");
    });

    it("tracks redo command name after undo", async () => {
      const cmd = testCommand("ImportantAction", [UpdateTopic.Frame], () => {});
      await ctx.execute(cmd);
      ctx.undo();

      expect(ctx.redoCommandName).toBe("ImportantAction");
    });
  });
});
