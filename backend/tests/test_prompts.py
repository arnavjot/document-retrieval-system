from langchain.chains import ConversationalRetrievalChain
from langchain.prompts import PromptTemplate
from langchain.schema import BaseRetriever, Document
from langchain_community.llms.fake import FakeListLLM

from agents.prompt_templates import CONDENSE_QUESTION_TEMPLATE, DOCUMENT_TEMPLATE, RAG_PROMPT_TEMPLATE


class OneChunk(BaseRetriever):
    def _get_relevant_documents(self, query, *, run_manager=None):
        return [Document(page_content="The encoder has six layers.", metadata={"source": "attention.pdf", "page": 3})]


def test_each_chunk_reaches_the_model_labelled_with_file_and_page():
    """Without the label the model can only cite 'the context'; with it, it can
    cite (attention.pdf, page 3)."""
    prompts = []

    class Recording(FakeListLLM):
        def _call(self, prompt, *args, **kwargs):
            prompts.append(prompt)
            return super()._call(prompt, *args, **kwargs)

    chain = ConversationalRetrievalChain.from_llm(
        llm=Recording(responses=["Six (attention.pdf, page 3)."]),
        retriever=OneChunk(),
        combine_docs_chain_kwargs={
            "prompt": PromptTemplate.from_template(RAG_PROMPT_TEMPLATE),
            "document_prompt": PromptTemplate.from_template(DOCUMENT_TEMPLATE),
        },
        condense_question_prompt=PromptTemplate.from_template(CONDENSE_QUESTION_TEMPLATE),
    )
    chain({"question": "How many layers?", "chat_history": []})
    assert "[attention.pdf, page 3]\nThe encoder has six layers." in prompts[-1]
